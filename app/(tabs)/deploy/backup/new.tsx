import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius } from '@/lib/theme';
import { listPm2Apps, listDatabases, backupProject, backupDatabase, ApiError } from '@/lib/api';

type Mode = 'project' | 'database';

export default function NewBackupScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('project');
  const [selected, setSelected] = useState<string | null>(null);

  const pm2Apps = useQuery({ queryKey: ['pm2-apps'], queryFn: listPm2Apps, enabled: mode === 'project' });
  const databases = useQuery({ queryKey: ['databases'], queryFn: listDatabases, enabled: mode === 'database' });

  const backupMutation = useMutation({
    mutationFn: (name: string) => (mode === 'project' ? backupProject(name) : backupDatabase(name)),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      Alert.alert('Backup Selesai', `File "${result.file}" berhasil dibuat.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => Alert.alert('Gagal Backup', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function switchMode(next: Mode) {
    setMode(next);
    setSelected(null);
  }

  function handleBackup() {
    if (!selected) return;
    const label = mode === 'project' ? `project "${selected}"` : `database "${selected}"`;
    Alert.alert(
      `Backup ${label}?`,
      mode === 'database'
        ? 'Proses dump database bisa makan waktu beberapa menit untuk database besar. Tunggu sampai selesai, jangan tutup app.'
        : 'node_modules, .next, dan .git tidak ikut di-backup (bisa dibangun ulang).',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Backup Sekarang', onPress: () => backupMutation.mutate(selected) },
      ]
    );
  }

  const items = mode === 'project' ? pm2Apps.data?.apps.map((a) => a.name) ?? [] : databases.data?.databases ?? [];
  const isLoading = mode === 'project' ? pm2Apps.isLoading : databases.isLoading;
  const isError = mode === 'project' ? pm2Apps.isError : databases.isError;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.segmented}>
        <SegmentBtn label="Project" active={mode === 'project'} onPress={() => switchMode('project')} />
        <SegmentBtn label="Database" active={mode === 'database'} onPress={() => switchMode('database')} />
      </View>

      <Text style={styles.sectionTitle}>
        {mode === 'project' ? 'Pilih Project (dari PM2)' : 'Pilih Database'}
      </Text>

      {isLoading && <Card><Text style={styles.mutedText}>Memuat...</Text></Card>}
      {isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>Gagal ambil daftar. Coba lagi.</Text>
        </Card>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <Card><Text style={styles.mutedText}>Belum ada {mode === 'project' ? 'app di PM2' : 'database'}.</Text></Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Card style={{ padding: 0 }}>
          {items.map((name, i) => (
            <Pressable
              key={name}
              onPress={() => setSelected(name)}
              style={[styles.itemRow, i > 0 && styles.rowDivider]}
            >
              <Text style={[styles.itemLabel, selected === name && { color: colors.accent, fontWeight: '700' }]} numberOfLines={1}>
                {name}
              </Text>
              {selected === name && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
            </Pressable>
          ))}
        </Card>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          label={selected ? `Backup "${selected}"` : 'Pilih dulu di atas'}
          onPress={handleBackup}
          disabled={!selected}
          loading={backupMutation.isPending}
        />
      </View>
    </ScrollView>
  );
}

function SegmentBtn({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  segmented: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.accentSoft },
  segmentLabel: { fontSize: 13, fontWeight: '700', color: colors.inkMuted },
  segmentLabelActive: { color: colors.accent },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg },
  itemLabel: { fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
