import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius } from '@/lib/theme';
import {
  getCoolifyApplicationLogs,
  findActiveDeploymentForApp,
  getApplicationDeploymentHistory,
  getDeploymentDetail,
  DeploymentLogStep,
} from '@/lib/coolifyApi';
import { listRegisteredProjects, readContainerFile } from '@/lib/companionApi';

const ACTIVE_STATUSES = ['in_progress', 'queued'];
const NEAR_BOTTOM_THRESHOLD = 60;

/**
 * REDESIGN (5 Agustus 2026) - lihat REALTIME-DEPLOY-LOG.md. Auto-detect
 * deployment aktif (bukan lagi session-limited nunggu klik Start dari app
 * sendiri), render incremental via index array (field "order" gak ada di
 * API beneran), polling 2 detik.
 *
 * UPDATE (5 Agustus 2026, feedback user):
 * - "Sticky" tracking: deployment_uuid yang udah ketemu TIDAK di-clear
 *   cuma karena statusnya udah finished - biar buka layar lagi masih liat
 *   log yang sama, bukan "gak ada deploy aktif". Cuma diganti kalau
 *   ketemu deployment BARU yang aktif (bukan di-reset asal).
 * - Status bar warna dinamis (ijo/merah/kuning), pake Ionicons bukan
 *   emoji/simbol unicode.
 * - Auto-scroll CUMA jalan kalau user emang lagi di bawah - discroll ke
 *   atas baca history = berhenti maksa, ada tombol "Lompat ke Terbaru".
 * - Toggle tampilin/sembunyiin step "hidden" (detail teknis internal).
 * - Teks log BISA di-select/copy (long-press) - scope CUMA ke baris log,
 *   BUKAN label tombol (itu tetap non-selectable, biar gak aneh).
 * - Runtime log sekarang polling otomatis 2 detik selama tab-nya aktif,
 *   berhenti kalau pindah tab (React Query "enabled" urus otomatis).
 */
export default function CoolifyLogsScreen() {
  const params = useLocalSearchParams<{ applicationUuid?: string }>();

  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject =
    projects.find((p) => p.applicationUuid === params.applicationUuid) ??
    projects.find((p) => p.key === selectedKey) ??
    projects[0] ??
    null;

  const [activeTab, setActiveTab] = useState<'runtime' | 'build'>('build');
  const [showHidden, setShowHidden] = useState(false);

  // ---- Runtime log - sekarang polling otomatis (bukan tombol manual) selama tab ini aktif ----
  const runtimeQuery = useQuery({
    queryKey: ['runtime-logs', selectedProject?.applicationUuid],
    queryFn: () => getCoolifyApplicationLogs(selectedProject!.applicationUuid, 300),
    enabled: Boolean(selectedProject) && activeTab === 'runtime',
    refetchInterval: 2000,
  });

  // BARU (6 Agustus 2026) - Laravel nulis error ke FILE (storage/logs/laravel.log),
  // BUKAN stdout/stderr container - makanya runtimeQuery di atas (baca stdout
  // via getCoolifyApplicationLogs) GAK PERNAH nangkep error 500 Laravel (kejadian
  // nyata: kasus 500 kemarin gak nongol sama sekali di situ). On-demand doang
  // (bukan auto-poll kayak runtime log) - file bisa gede & gak perlu di-refresh
  // tiap 2 detik kayak stdout.
  const isLaravel = selectedProject?.type === 'laravel';
  const [showLaravelLog, setShowLaravelLog] = useState(false);
  const laravelLogQuery = useQuery({
    queryKey: ['laravel-log-file', selectedProject?.applicationUuid],
    queryFn: () => readContainerFile(selectedProject!.applicationUuid, 'storage/logs/laravel.log'),
    enabled: Boolean(selectedProject) && activeTab === 'runtime' && isLaravel && showLaravelLog,
  });
  // Tampilin cuma ~8000 karakter TERAKHIR (baris error paling baru ada di
  // bawah file) - biar gak bikin layar berat kalau file udah gede. Tombol
  // Download tetep ngirim FULL CONTENT, bukan yang udah dipotong ini.
  const laravelLogPreview = laravelLogQuery.data?.content
    ? laravelLogQuery.data.content.slice(-8000)
    : null;

  // ---- Build log - sticky tracking ----
  // FIX (5 Agustus 2026, bug nyata: log ilang cuma tutup-buka layar, BUKAN
  // reload app): sebelumnya disimpen di useState LOKAL LAYAR INI - layar
  // Log itu modal, ditutup = di-unmount = state ke-hapus total, buka lagi =
  // komponen baru dari nol. Sekarang disimpen di cache QueryClient (level
  // app, dibikin sekali di root, HIDUP selama app-nya gak di-reload/kill) -
  // tutup-buka layar TIDAK ngilangin ini lagi, cuma reload app beneran yang
  // bakal reset (itu wajar, gak ada state React yang tahan reload).
  const qc = useQueryClient();
  const trackedQuery = useQuery<string | undefined>({
    queryKey: ['last-known-deployment', selectedProject?.applicationUuid],
    queryFn: () => undefined, // slot cache doang, gak pernah auto-fetch - cuma diisi manual via setQueryData
    enabled: false,
    staleTime: Infinity,
  });
  const trackedDeploymentUuid = trackedQuery.data;

  const activeSearchQuery = useQuery({
    queryKey: ['active-deployment', selectedProject?.applicationUuid],
    queryFn: () => findActiveDeploymentForApp(selectedProject!.applicationUuid),
    enabled: Boolean(selectedProject) && activeTab === 'build',
    refetchInterval: 5000, // tetep dicek berkala, biar deploy baru kedetect otomatis
  });

  // FIX (5 Agustus 2026, bug nyata: "log ilang begitu app di-reload" - beda
  // dari "tutup-buka layar" yang udah difix di atas): trackedQuery itu SLOT
  // CACHE doang, kosong total begitu app di-kill/reload (RAM, gak persist).
  // activeSearchQuery di atas CUMA nemuin yang statusnya in_progress/queued -
  // begitu deploy kelar & app di-reload, gak ada lagi yang "aktif" buat
  // ditemuin, hasilnya "Belum ada deploy yang tercatat" padahal riwayatnya
  // ADA, cuma kesimpen di server Coolify, bukan di app. Query BARU ini nyari
  // riwayat lengkap (apapun statusnya) - dipanggil begitu layar dibuka,
  // hasilnya dipake buat SEEDING trackedDeploymentUuid, TAPI CUMA kalau
  // belum ke-set - activeSearchQuery tetep yang menang kalau nemu yang lebih
  // baru & masih aktif (lihat effect di bawah).
  const historyQuery = useQuery({
    queryKey: ['deployment-history', selectedProject?.applicationUuid],
    queryFn: () => getApplicationDeploymentHistory(selectedProject!.applicationUuid),
    enabled: Boolean(selectedProject) && activeTab === 'build',
    staleTime: 30000,
  });

  useEffect(() => {
    if (trackedDeploymentUuid || !selectedProject) return; // udah ke-seed (dari sesi ini atau dari effect active di bawah) - jangan timpa
    const history = historyQuery.data;
    if (!history || history.length === 0) return;
    const mostRecent = history.reduce((newest, d) => (d.id > newest.id ? d : newest));
    qc.setQueryData(['last-known-deployment', selectedProject.applicationUuid], mostRecent.deployment_uuid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQuery.data, trackedDeploymentUuid, selectedProject?.applicationUuid]);

  useEffect(() => {
    const found = activeSearchQuery.data?.deployment_uuid;
    // Cuma UPDATE kalau ketemu yang baru & beda - jangan pernah clear ke
    // undefined cuma karena pencarian ini gak nemu (itu bukan berarti gak
    // ada history, cuma berarti gak ada yang AKTIF sekarang).
    if (found && found !== trackedDeploymentUuid && selectedProject) {
      qc.setQueryData(['last-known-deployment', selectedProject.applicationUuid], found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSearchQuery.data]);

  const deploymentDetailQuery = useQuery({
    queryKey: ['deployment-detail', trackedDeploymentUuid],
    queryFn: () => getDeploymentDetail(trackedDeploymentUuid!),
    enabled: Boolean(trackedDeploymentUuid),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !ACTIVE_STATUSES.includes(status) ? false : 2000;
    },
  });

  const [displayedSteps, setDisplayedSteps] = useState<DeploymentLogStep[]>([]);
  const lastIndexRef = useRef(0);

  useEffect(() => {
    setDisplayedSteps([]);
    lastIndexRef.current = 0;
  }, [trackedDeploymentUuid]);

  useEffect(() => {
    const allSteps = deploymentDetailQuery.data?.steps;
    if (!allSteps) return;
    if (allSteps.length > lastIndexRef.current) {
      const newSteps = allSteps.slice(lastIndexRef.current);
      lastIndexRef.current = allSteps.length;
      setDisplayedSteps((prev) => [...prev, ...newSteps]);
    }
  }, [deploymentDetailQuery.data]);

  const visibleSteps = showHidden ? displayedSteps : displayedSteps.filter((s) => !s.hidden);
  const buildStatus = deploymentDetailQuery.data?.status ?? activeSearchQuery.data?.status;
  const isBuildActive = buildStatus ? ACTIVE_STATUSES.includes(buildStatus) : false;
  const isBuildFailed = buildStatus === 'failed';
  const isBuildSuccess = buildStatus === 'finished';

  // ---- Auto-scroll cuma kalau user lagi di bawah, gak maksa kalau lagi baca history ----
  const listRef = useRef<ScrollView>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setIsNearBottom(distanceFromBottom < NEAR_BOTTOM_THRESHOLD);
  }

  useEffect(() => {
    if (isNearBottom && visibleSteps.length > 0) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSteps.length]);

  function jumpToLatest() {
    listRef.current?.scrollToEnd({ animated: true });
    setIsNearBottom(true);
  }

  // BARU (5 Agustus 2026) - Download Log. Pakai `expo-file-system/legacy`
  // (bukan `expo-file-system` biasa) - SDK 54 udah pindah ke API baru
  // (File/Directory class), tapi belum kesempatan verifikasi live apakah
  // path "/legacy" ini beneran ke-export persis kayak API lama
  // (writeAsStringAsync dkk) - WAJIB DITES sekali abis rebuild, sebelum
  // dianggap final.
  async function handleDownloadLog() {
    const text = visibleSteps.map((s) => s.output).join('\n');
    if (!text) {
      Alert.alert('Kosong', 'Belum ada log buat di-download.');
      return;
    }
    const safeName = (selectedProject?.key ?? 'app').replace(/[^a-z0-9-]/gi, '-');
    const filename = `deploy-log-${safeName}-${Date.now()}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Simpan/Bagikan Log' });
      } else {
        Alert.alert('Tersimpan', `Log disimpan sementara di:\n${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Gagal', err instanceof Error ? err.message : 'Gagal simpan log ke file.');
    }
  }

  async function handleDownloadRuntimeLog() {
    const text = runtimeQuery.data;
    if (!text) return;
    const safeName = (selectedProject?.key ?? 'app').replace(/[^a-z0-9-]/gi, '-');
    const filename = `runtime-log-${safeName}-${Date.now()}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Simpan/Bagikan Log' });
      } else {
        Alert.alert('Tersimpan', `Log disimpan sementara di:\n${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Gagal', err instanceof Error ? err.message : 'Gagal simpan log ke file.');
    }
  }

  async function handleDownloadLaravelLog() {
    const text = laravelLogQuery.data?.content;
    if (!text) return;
    const safeName = (selectedProject?.key ?? 'app').replace(/[^a-z0-9-]/gi, '-');
    const filename = `laravel-log-${safeName}-${Date.now()}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;
    try {
      await FileSystem.writeAsStringAsync(fileUri, text, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Simpan/Bagikan Log Laravel' });
      } else {
        Alert.alert('Tersimpan', `Log disimpan sementara di:\n${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Gagal', err instanceof Error ? err.message : 'Gagal simpan log ke file.');
    }
  }

  if (projectsQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Memuat daftar project...</Text>
        </Card>
      </View>
    );
  }

  if (projects.length === 0) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Belum ada project Coolify terdaftar.</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.tabRow}>
        <Pressable onPress={() => setActiveTab('build')} style={[styles.tab, activeTab === 'build' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'build' && styles.tabTextActive]}>Build</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('runtime')} style={[styles.tab, activeTab === 'runtime' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'runtime' && styles.tabTextActive]}>Runtime</Text>
        </Pressable>
      </View>

      {projects.length > 1 && !params.applicationUuid && (
        <View style={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setSelectedKey(p.key)}
              style={[styles.chip, (selectedKey ?? projects[0].key) === p.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, (selectedKey ?? projects[0].key) === p.key && styles.chipTextActive]}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {activeTab === 'build' ? (
        <>
          <View style={[styles.statusBar, isBuildFailed && styles.statusBarFailed, isBuildSuccess && styles.statusBarSuccess]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 }}>
              {isBuildActive ? (
                <View style={styles.pulseDot} />
              ) : isBuildFailed ? (
                <Ionicons name="close-circle" size={16} color={colors.red} />
              ) : isBuildSuccess ? (
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
              ) : null}
              <Text
                style={[
                  styles.statusText,
                  isBuildFailed && { color: colors.red },
                  isBuildSuccess && { color: colors.green },
                ]}
              >
                {(activeSearchQuery.isLoading || historyQuery.isLoading) && !trackedDeploymentUuid
                  ? 'Nyari riwayat deploy...'
                  : !trackedDeploymentUuid
                    ? 'Belum ada deploy yang tercatat buat project ini.'
                    : `${buildStatus}${isBuildActive ? ' · polling tiap 2 detik' : ''}`}
              </Text>
            </View>
            <Pressable onPress={handleDownloadLog} style={{ marginLeft: spacing.sm }}>
              <Ionicons name="download-outline" size={18} color={colors.inkMuted} />
            </Pressable>
            <Pressable onPress={() => setShowHidden((v) => !v)}>
              <Text style={styles.toggleHiddenText}>{showHidden ? 'Sembunyikan detail' : 'Tampilkan detail'}</Text>
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            <ScrollView
              ref={listRef}
              contentContainerStyle={styles.logContent}
              onScroll={handleScroll}
              scrollEventThrottle={100}
            >
              {visibleSteps.length > 0 ? (
                // Satu <Text> ROOT, semua baris jadi <Text> NESTED di dalamnya
                // (bukan FlatList per-item lagi) - biar drag-select bisa bebas
                // sepanjang apa aja, gak kepotong per-baris. Warna stderr tetap
                // kepertahanin lewat style di tiap nested <Text>.
                <Text selectable style={styles.logLine}>
                  {visibleSteps.map((item, i) => (
                    <Text key={i} style={item.type === 'stderr' ? styles.logLineErr : undefined}>
                      {item.output}
                      {'\n'}
                    </Text>
                  ))}
                </Text>
              ) : (
                !activeSearchQuery.isLoading &&
                !historyQuery.isLoading &&
                !trackedDeploymentUuid && (
                  <Card>
                    <Text style={styles.mutedText}>
                      Trigger Start/Deploy/Restart (dari app atau dashboard Coolify) buat lihat log build-nya di sini.
                    </Text>
                  </Card>
                )
              )}
            </ScrollView>
            {!isNearBottom && visibleSteps.length > 0 && (
              <Pressable style={styles.jumpBtn} onPress={jumpToLatest}>
                <Ionicons name="arrow-down-circle" size={16} color={colors.onAccent} />
                <Text style={styles.jumpBtnText}>Lompat ke Terbaru</Text>
              </Pressable>
            )}
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.introCard}>
            <Text style={styles.intro}>
              Stdout/stderr app yang lagi jalan, auto-refresh tiap 2 detik selama tab ini dibuka - berhenti kalau
              pindah tab.
            </Text>
          </Card>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.projectLabel}>{selectedProject?.name ?? '-'}</Text>
              {runtimeQuery.data ? (
                <Pressable onPress={handleDownloadRuntimeLog}>
                  <Ionicons name="download-outline" size={18} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
            {runtimeQuery.isLoading && <Text style={styles.mutedText}>Memuat...</Text>}
            {runtimeQuery.isError && (
              <Text style={[styles.mutedText, { color: colors.red }]}>Gagal ambil log: {(runtimeQuery.error as Error)?.message}</Text>
            )}
          </Card>
          {runtimeQuery.data != null && (
            <Card>
              <ScrollView horizontal>
                <Text selectable style={styles.code}>
                  {runtimeQuery.data || '(kosong)'}
                </Text>
              </ScrollView>
            </Card>
          )}

          {isLaravel && (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.projectLabel}>Log Laravel (storage/logs/laravel.log)</Text>
                {laravelLogQuery.data && (
                  <Pressable onPress={handleDownloadLaravelLog}>
                    <Ionicons name="download-outline" size={18} color={colors.inkMuted} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.subtextLog}>
                Error 500 & exception Laravel nulis ke sini, BUKAN ke runtime log di atas (yang cuma nangkep stdout).
              </Text>
              {!showLaravelLog && (
                <Button label="Buka Log Laravel" variant="secondary" onPress={() => setShowLaravelLog(true)} />
              )}
              {showLaravelLog && (
                <>
                  {laravelLogQuery.isLoading && <Text style={styles.mutedText}>Memuat...</Text>}
                  {laravelLogQuery.isError && (
                    <Text style={[styles.mutedText, { color: colors.red }]}>
                      Gagal ambil file: {(laravelLogQuery.error as Error)?.message}
                    </Text>
                  )}
                  {laravelLogPreview && (
                    <ScrollView horizontal>
                      <Text selectable style={styles.code}>
                        {laravelLogPreview}
                      </Text>
                    </ScrollView>
                  )}
                  <Button label="Refresh" variant="secondary" onPress={() => laravelLogQuery.refetch()} />
                </>
              )}
            </Card>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  projectLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  subtextLog: { fontSize: 11, color: colors.inkFaint, marginBottom: spacing.sm, lineHeight: 15 },
  code: { fontFamily: 'monospace', fontSize: 11, color: colors.ink, lineHeight: 16 },
  tabRow: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { fontSize: 12.5, fontWeight: '700', color: colors.inkFaint },
  tabTextActive: { color: colors.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.inkMuted },
  chipTextActive: { color: colors.accent },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  statusBarFailed: { backgroundColor: colors.redSoft },
  statusBarSuccess: { backgroundColor: colors.greenSoft },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  statusText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  toggleHiddenText: { fontSize: 11, fontWeight: '700', color: colors.accent },
  logContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  logLine: { fontFamily: 'monospace', fontSize: 11, color: colors.ink, lineHeight: 16 },
  logLineErr: { color: colors.red },
  jumpBtn: {
    position: 'absolute',
    bottom: spacing.lg,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  jumpBtnText: { fontSize: 12, fontWeight: '700', color: colors.onAccent },
});
