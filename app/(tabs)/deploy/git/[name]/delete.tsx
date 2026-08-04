import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AppModal, AppModalButton } from '@/components/AppModal';
import { colors, spacing, radius } from '@/lib/theme';
import { getProjectDeletePreview, deleteProjectFull, ApiError, DeleteProjectOptions } from '@/lib/api';

function Toggle({ label, sub, value, onChange, danger }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sub ? <Text style={styles.toggleSub}>{sub}</Text> : null}
      </View>
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={22}
        color={value ? (danger ? colors.red : colors.accent) : colors.inkFaint}
      />
    </Pressable>
  );
}

export default function ProjectDeleteScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();

  const [deletePm2, setDeletePm2] = useState(true);
  const [deleteNginx, setDeleteNginx] = useState(true);
  const [dropDatabases, setDropDatabases] = useState(false);
  const [deleteFolder, setDeleteFolder] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);

  const preview = useQuery({
    queryKey: ['project-delete-preview', name],
    queryFn: () => getProjectDeletePreview(name),
    enabled: Boolean(name),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      const opts: DeleteProjectOptions = { deletePm2, deleteNginx, dropDatabases, deleteFolder };
      return deleteProjectFull(name, opts);
    },
    onSuccess: () => {
      setConfirmVisible(false);
      setResultVisible(true);
    },
    onError: (err) => {
      setConfirmVisible(false);
      Alert.alert('Gagal Hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  const p = preview.data;
  const confirmButtons: AppModalButton[] = [
    { label: 'Batal', onPress: () => setConfirmVisible(false), variant: 'secondary' },
    { label: 'Hapus Permanen', onPress: () => deleteMutation.mutate(), variant: 'danger' },
  ];
  const resultButtons: AppModalButton[] = [
    { label: 'Selesai', onPress: () => router.replace('/(tabs)/deploy'), variant: 'primary' },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `Hapus Project` }} />

      <Text style={styles.warning}>
        Menghapus project "{name}" bersifat PERMANEN untuk bagian yang dicentang di bawah. Cek dulu dampaknya sebelum
        lanjut.
      </Text>

      {preview.isLoading && <Card><Text style={styles.mutedText}>Memuat dampak...</Text></Card>}
      {preview.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal ambil preview: {(preview.error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}

      {p && (
        <Card>
          <Text style={styles.sectionLabel}>Yang Terdeteksi</Text>
          <InfoLine label="PM2 App" value={p.pm2App ? `${p.pm2App.name} (${p.pm2App.status})` : 'tidak ada'} />
          <InfoLine
            label="Site Nginx"
            value={p.nginxCheckFailed ? `gagal cek: ${p.nginxCheckError ?? '-'}` : p.nginxFile ?? 'tidak ada'}
          />
          <InfoLine label="Folder Project" value={p.folderExists ? 'ada' : 'tidak ada'} />
          <InfoLine
            label="Database Terkait"
            value={p.relatedDatabases.length ? p.relatedDatabases.map((d) => d.dbName).join(', ') : 'tidak ada'}
          />
        </Card>
      )}

      <Text style={styles.sectionTitle}>Pilih Yang Ikut Dihapus</Text>
      <Card>
        <Toggle label="Hapus dari PM2" sub="Stop & buang entry PM2 (default: ya)" value={deletePm2} onChange={setDeletePm2} />
        <View style={styles.divider} />
        <Toggle label="Hapus Site Nginx" sub="Buang file config nginx terkait domain ini" value={deleteNginx} onChange={setDeleteNginx} />
        <View style={styles.divider} />
        <Toggle
          label="Drop Database"
          sub="DESTRUKTIF - database & isinya hilang permanen. Kalau tidak dicentang, database TETAP ada, cuma di-unlink dari project."
          value={dropDatabases}
          onChange={setDropDatabases}
          danger
        />
        <View style={styles.divider} />
        <Toggle
          label="Hapus Folder Project"
          sub="DESTRUKTIF - source code di server dihapus permanen (default: tidak)"
          value={deleteFolder}
          onChange={setDeleteFolder}
          danger
        />
      </Card>

      <Button label={`Hapus Project "${name}"`} variant="danger" onPress={() => setConfirmVisible(true)} loading={deleteMutation.isPending} />

      <AppModal
        visible={confirmVisible}
        kind="warning"
        title={`Hapus "${name}" permanen?`}
        message={`${deletePm2 ? '• PM2 app dihapus\n' : ''}${deleteNginx ? '• Site nginx dihapus\n' : ''}${dropDatabases ? '• Database DI-DROP (data hilang)\n' : ''}${deleteFolder ? '• Folder project DIHAPUS\n' : ''}Tindakan ini tidak bisa dibatalkan.`}
        buttons={confirmButtons}
        onRequestClose={() => setConfirmVisible(false)}
      />

      <AppModal
        visible={resultVisible}
        kind="success"
        title="Project Dihapus"
        message={
          deleteMutation.data
            ? deleteMutation.data.results.map((r) => `${r.ok ? '✓' : '✗'} ${r.step}${r.message ? ` - ${r.message}` : ''}`).join('\n')
            : undefined
        }
        buttons={resultButtons}
        onRequestClose={() => router.replace('/(tabs)/deploy')}
      />
    </ScrollView>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  warning: { fontSize: 12.5, color: colors.red, lineHeight: 18, marginBottom: spacing.md, fontWeight: '600' },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  infoLabel: { fontSize: 12.5, color: colors.inkMuted },
  infoValue: { fontSize: 12.5, color: colors.ink, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: spacing.md },
  toggleLabel: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  toggleSub: { fontSize: 11.5, color: colors.inkMuted, marginTop: 2, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.divider },
});
