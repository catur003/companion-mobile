import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AppModal, AppModalKind, AppModalButton } from '@/components/AppModal';
import { colors, radius, spacing } from '@/lib/theme';
import { scanProjectCaches, deleteCacheItem, CacheItem, ApiError } from '@/lib/api';

interface ModalState {
  visible: boolean;
  kind: AppModalKind;
  title: string;
  message?: string;
  buttons?: AppModalButton[];
}

const MODAL_CLOSED: ModalState = { visible: false, kind: 'info', title: '' };

/** Format bytes ala `formatBytes()` di backend (cuma dipakai buat total di sana - item per-item belum diformat, jadi diulang di sisi app). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes;
  let unitIdx = -1;
  do {
    val /= 1024;
    unitIdx++;
  } while (val >= 1024 && unitIdx < units.length - 1);
  return `${val.toFixed(1)} ${units[unitIdx]}`;
}

interface ProjectGroup {
  project: string;
  items: CacheItem[];
  totalBytes: number;
}

export default function CleanupScreen() {
  const qc = useQueryClient();
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [modal, setModal] = useState<ModalState>(MODAL_CLOSED);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['cleanup-project-caches'],
    queryFn: scanProjectCaches,
  });

  const groups: ProjectGroup[] = useMemo(() => {
    const items = data?.items ?? [];
    const map = new Map<string, ProjectGroup>();
    for (const item of items) {
      const key = item.project ?? '(tanpa nama project)';
      if (!map.has(key)) map.set(key, { project: key, items: [], totalBytes: 0 });
      const g = map.get(key)!;
      g.items.push(item);
      g.totalBytes += item.bytes;
    }
    return Array.from(map.values());
  }, [data]);

  function closeModal() {
    setModal(MODAL_CLOSED);
  }

  function showInfo(kind: AppModalKind, title: string, message?: string) {
    setModal({ visible: true, kind, title, message, buttons: [{ label: 'OK', onPress: closeModal }] });
  }

  async function runDelete(item: CacheItem) {
    setBusyPath(item.path);
    try {
      await deleteCacheItem(item.owner, item.path);
      await qc.invalidateQueries({ queryKey: ['cleanup-project-caches'] });
    } catch (err) {
      showInfo('error', 'Gagal hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan tak terduga.');
    } finally {
      setBusyPath(null);
    }
  }

  function confirmDeleteItem(item: CacheItem) {
    setModal({
      visible: true,
      kind: 'warning',
      title: 'Hapus cache ini?',
      message: `${item.label}\n${item.path}\n\nUkuran: ${formatBytes(item.bytes)}. Folder ini regenerable (dibuat ulang otomatis saat build/install berikutnya), tapi tindakan hapus tidak bisa dibatalkan.`,
      buttons: [
        { label: 'Batal', onPress: closeModal, variant: 'secondary' },
        {
          label: 'Hapus',
          variant: 'danger',
          onPress: () => {
            closeModal();
            runDelete(item);
          },
        },
      ],
    });
  }

  async function confirmDeleteAll() {
    const items = data?.items ?? [];
    if (!items.length) return;
    setModal({
      visible: true,
      kind: 'warning',
      title: `Hapus semua cache? (${items.length} folder)`,
      message: `Total ${data?.totalBytesLabel ?? formatBytes(data?.totalBytes ?? 0)} akan dihapus dari semua project. Tidak bisa dibatalkan.`,
      buttons: [
        { label: 'Batal', onPress: closeModal, variant: 'secondary' },
        {
          label: 'Hapus Semua',
          variant: 'danger',
          onPress: async () => {
            closeModal();
            setBusyAll(true);
            let failed = 0;
            for (const item of items) {
              try {
                await deleteCacheItem(item.owner, item.path);
              } catch {
                failed++;
              }
            }
            setBusyAll(false);
            await qc.invalidateQueries({ queryKey: ['cleanup-project-caches'] });
            showInfo(
              failed ? 'warning' : 'success',
              failed ? 'Sebagian gagal' : 'Selesai',
              failed ? `${failed} dari ${items.length} folder gagal dihapus. Coba lagi satu-satu kalau perlu.` : 'Semua cache project berhasil dihapus.'
            );
          },
        },
      ],
    });
  }

  const items = data?.items ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.project}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            <Text style={styles.intro}>
              Cache build & dependency (.next/cache, node_modules/.cache) dari tiap project yang tercatat di PM2.
              Aman dihapus - dibuat ulang otomatis pas project di-build/di-install lagi.
            </Text>
            {!isLoading && !isError && (
              <Card style={styles.totalCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.totalLabel}>Total bisa dibebaskan</Text>
                  <Text style={styles.totalValue}>{data?.totalBytesLabel ?? formatBytes(data?.totalBytes ?? 0)}</Text>
                </View>
                <Button
                  label="Hapus Semua"
                  variant="danger"
                  loading={busyAll}
                  disabled={!items.length}
                  onPress={confirmDeleteAll}
                />
              </Card>
            )}
            {isError && (
              <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
                <Text style={{ color: colors.red, fontSize: 13 }}>
                  Gagal scan cache project: {(error as Error)?.message ?? 'unknown error'}
                </Text>
              </Card>
            )}
            {isLoading && (
              <Card style={styles.loadingCard}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.loadingText}>Memindai cache project...</Text>
              </Card>
            )}
          </>
        }
        ListEmptyComponent={
          !isLoading && !isError ? (
            <Card>
              <Text style={styles.emptyText}>Gak ada cache yang cukup besar buat dibersihin saat ini. 🎉</Text>
            </Card>
          ) : null
        }
        renderItem={({ item: group }) => (
          <View style={styles.group}>
            <Text style={styles.groupTitle}>{group.project}</Text>
            {group.items.map((item) => (
              <Card key={item.path} style={styles.itemRow}>
                <View style={[styles.itemIconWrap, { backgroundColor: colors.blueSoft }]}>
                  <Ionicons name="folder-outline" size={16} color={colors.blue} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemLabel}>{item.label}</Text>
                  <Text style={styles.itemPath} numberOfLines={1}>
                    {item.path}
                  </Text>
                  <Text style={styles.itemSize}>{formatBytes(item.bytes)}</Text>
                </View>
                <Button
                  label="Hapus"
                  variant="secondary"
                  loading={busyPath === item.path}
                  disabled={busyAll}
                  onPress={() => confirmDeleteItem(item)}
                />
              </Card>
            ))}
          </View>
        )}
      />

      <AppModal
        visible={modal.visible}
        kind={modal.kind}
        title={modal.title}
        message={modal.message}
        buttons={modal.buttons}
        onRequestClose={closeModal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18, marginBottom: spacing.md },
  totalCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  totalLabel: { fontSize: 11.5, color: colors.inkMuted },
  totalValue: { fontSize: 20, fontWeight: '800', color: colors.ink, marginTop: 2 },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  loadingText: { fontSize: 13, color: colors.inkMuted },
  group: { marginBottom: spacing.md },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemIconWrap: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  itemLabel: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  itemPath: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
  itemSize: { fontSize: 11.5, color: colors.inkMuted, marginTop: 2, fontWeight: '600' },
});
