import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing } from '@/lib/theme';
import { listPm2Apps, listDatabases, restoreProject, restoreDatabase, parseBackupFilename, ApiError } from '@/lib/api';

export default function RestoreBackupScreen() {
  const { filename } = useLocalSearchParams<{ filename: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const parsed = parseBackupFilename(filename ?? '');
  const isProject = parsed.kind === 'project';
  const [selected, setSelected] = useState<string | null>(null);

  const pm2Apps = useQuery({ queryKey: ['pm2-apps'], queryFn: listPm2Apps, enabled: isProject });
  const databases = useQuery({ queryKey: ['databases'], queryFn: listDatabases, enabled: !isProject });

  const items = isProject ? pm2Apps.data?.apps.map((a) => a.name) ?? [] : databases.data?.databases ?? [];
  const isLoading = isProject ? pm2Apps.isLoading : databases.isLoading;
  const isError = isProject ? pm2Apps.isError : databases.isError;

  // Auto-pilih target yang namanya cocok sama nama di filename backup, kalau ada.
  const defaultTarget = items.includes(parsed.name) ? parsed.name : null;
  const effectiveSelected = selected ?? defaultTarget;

  const restoreMutation = useMutation({
    mutationFn: (target: string) => (isProject ? restoreProject(target, filename) : restoreDatabase(target, filename)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      Alert.alert('Restore Selesai', `${isProject ? 'Project' : 'Database'} "${effectiveSelected}" berhasil di-restore.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => Alert.alert('Gagal Restore', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function handleRestore() {
    if (!effectiveSelected) return;
    const target = effectiveSelected;
    Alert.alert(
      `Timpa "${target}"?`,
      `Seluruh isi ${isProject ? 'folder project' : 'database'} "${target}" akan DIGANTI dengan isi backup "${filename}". Tidak ada undo otomatis. Lanjut?`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Ya, Timpa & Restore', style: 'destructive', onPress: () => restoreMutation.mutate(target) },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Restore Backup' }} />

      <Card style={{ borderColor: colors.amberSoft, backgroundColor: colors.amberSoft }}>
        <View style={styles.warnRow}>
          <Ionicons name="warning-outline" size={18} color={colors.amber} />
          <Text style={styles.warnText}>
            Restore MENIMPA seluruh isi {isProject ? 'folder project' : 'database'} tujuan. Tidak ada undo
            otomatis - pastikan target benar sebelum lanjut.
          </Text>
        </View>
      </Card>

      <Card>
        <Row label="File" value={filename ?? ''} />
        <Row label="Jenis" value={isProject ? 'Project (.tar.gz)' : 'Database (.sql.gz)'} topGap />
        <Row label="Nama Asal" value={parsed.name} topGap />
      </Card>

      <Text style={styles.sectionTitle}>
        Restore ke {isProject ? 'Project' : 'Database'} Mana?
      </Text>

      {isLoading && <Card><Text style={styles.mutedText}>Memuat...</Text></Card>}
      {isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>Gagal ambil daftar target.</Text>
        </Card>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <Card>
          <Text style={styles.mutedText}>
            Belum ada {isProject ? 'app di PM2' : 'database'} yang terdaftar - restore butuh target yang
            sudah ada (project/database tidak dibuat otomatis).
          </Text>
        </Card>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Card style={{ padding: 0 }}>
          {items.map((name, i) => (
            <Pressable
              key={name}
              onPress={() => setSelected(name)}
              style={[styles.itemRow, i > 0 && styles.rowDivider]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemLabel, effectiveSelected === name && { color: colors.accent, fontWeight: '700' }]} numberOfLines={1}>
                  {name}
                </Text>
                {name === parsed.name && <Text style={styles.matchHint}>cocok dengan nama backup</Text>}
              </View>
              {effectiveSelected === name && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
            </Pressable>
          ))}
        </Card>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          label={effectiveSelected ? `Restore ke "${effectiveSelected}"` : 'Pilih target dulu'}
          variant="danger"
          onPress={handleRestore}
          disabled={!effectiveSelected}
          loading={restoreMutation.isPending}
        />
      </View>
    </ScrollView>
  );
}

function Row({ label, value, topGap }: { label: string; value: string; topGap?: boolean }) {
  return (
    <View style={[styles.row, topGap && { marginTop: spacing.sm }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  warnRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.amber, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { fontSize: 12, color: colors.inkMuted },
  rowValue: { fontSize: 12, fontWeight: '700', color: colors.ink, flexShrink: 1, textAlign: 'right' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg },
  itemLabel: { fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  matchHint: { fontSize: 10.5, color: colors.green, marginTop: 2 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
