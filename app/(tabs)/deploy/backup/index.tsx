import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { colors, spacing, radius } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { listBackups, deleteBackup, getDownloadTarget, parseBackupFilename, BackupFile, ApiError } from '@/lib/api';

export default function BackupListScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();
  const qc = useQueryClient();
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['backups'],
    queryFn: listBackups,
  });

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => deleteBackup(filename),
    onMutate: (filename) => setDeletingFile(filename),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
    },
    onError: (err) => Alert.alert('Gagal Hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
    onSettled: () => setDeletingFile(null),
  });

  const files: BackupFile[] = (data?.backups ?? []).map(parseBackupFilename);

  function openActions(item: BackupFile) {
    Alert.alert(
      item.name,
      `File: ${item.filename}`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Unduh ke HP', onPress: () => downloadToPhone(item) },
        { text: 'Restore', onPress: () => router.push(`/(tabs)/deploy/backup/restore/${encodeURIComponent(item.filename)}`) },
        { text: 'Hapus', style: 'destructive', onPress: () => confirmDelete(item) },
      ]
    );
  }

  /**
   * Stream file backup dari server ke cache lokal, lalu buka share sheet
   * bawaan OS (Sharing.shareAsync) - itu yang jadi jembatan ke "Simpan ke
   * file manager" / Google Drive / dll, bukan app ini yang nulis langsung ke
   * penyimpanan HP (RN gak boleh sembarang tulis ke shared storage tanpa
   * izin eksplisit dari user lewat sheet itu).
   */
  async function downloadToPhone(item: BackupFile) {
    try {
      setDownloadingFile(item.filename);
      const { url, headers } = await getDownloadTarget(item.filename);
      const dest = `${FileSystem.cacheDirectory}${item.filename}`;
      const result = await FileSystem.downloadAsync(url, dest, { headers });
      if (result.status !== 200) {
        throw new Error(`Server membalas status ${result.status}.`);
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, { dialogTitle: item.filename });
      } else {
        Alert.alert('Terunduh', `File tersimpan sementara di:\n${result.uri}`);
      }
    } catch (err) {
      Alert.alert('Gagal Unduh', err instanceof ApiError ? err.message : (err as Error)?.message || 'Terjadi kesalahan.');
    } finally {
      setDownloadingFile(null);
    }
  }

  function confirmDelete(item: BackupFile) {
    Alert.alert(
      `Hapus "${item.filename}"?`,
      'File backup ini akan dihapus PERMANEN dari server. Tindakan ini tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus Permanen', style: 'destructive', onPress: () => deleteMutation.mutate(item.filename) },
      ]
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={files}
        keyExtractor={(f) => f.filename}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            <Card onPress={() => router.push('/(tabs)/deploy/backup/import')} style={styles.importLink}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.type}>IMPORT</Text>
                  <Text style={styles.name}>Import SQL File Lepas</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </View>
            </Card>
            <Text style={styles.sectionTitle}>{isLoading ? 'Memuat...' : `${files.length} File Backup`}</Text>
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {isError ? `Gagal ambil daftar backup: ${(error as Error)?.message}` : 'Belum ada backup. Tap tombol + buat bikin backup pertama.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => openActions(item)}>
            <View style={styles.row}>
              <View style={[styles.iconWrap, { backgroundColor: item.kind === 'database' ? colors.blueSoft : colors.accentSoft }]}>
                <Ionicons
                  name={item.kind === 'database' ? 'server-outline' : 'folder-outline'}
                  size={18}
                  color={item.kind === 'database' ? colors.blue : colors.accent}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>{item.kind === 'database' ? 'DATABASE' : item.kind === 'project' ? 'PROJECT' : 'BACKUP'}</Text>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.time}>{item.timestamp ? item.timestamp.toLocaleString('id-ID') : item.filename}</Text>
              </View>
              {deletingFile === item.filename || downloadingFile === item.filename ? (
                <Text style={styles.mutedText}>...</Text>
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              )}
            </View>
          </Card>
        )}
      />
      <View style={styles.fabWrap}>
        <Fab onPress={() => router.push('/(tabs)/deploy/backup/new')}>
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </Fab>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  type: { fontSize: 10.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink, marginTop: 2 },
  time: { fontSize: 11, color: colors.inkFaint, marginTop: 3 },
  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  importLink: { borderColor: colors.amberSoft, backgroundColor: colors.amberSoft },
});
