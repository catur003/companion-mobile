import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { runCompanionDbMigrate, listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

// Tombol "isi otomatis" - ngisi textarea command, BUKAN langsung kirim.
// User bisa edit/gabung sebelum kirim (mis. tempel "&& npx tsx prisma/seed.ts"
// abis "push" buat 1x kirim gak 2x redeploy, atau ganti runner seed kalau
// generate-nya gak cocok sama struktur project).
const QUICK_FILL: { label: string; command: string; risk?: 'danger' | 'warning' }[] = [
  { label: 'Generate', command: 'npx prisma generate' },
  { label: 'DB Push', command: 'npx prisma db push' },
  { label: 'DB Push (Force)', command: 'npx prisma db push --accept-data-loss', risk: 'danger' },
  { label: 'Migrate Deploy', command: 'npx prisma migrate deploy' },
  { label: 'DB Seed', command: 'npx prisma db seed', risk: 'warning' },
];

/**
 * UI buat endpoint POST /db/migrate. UBAH (4 Agustus 2026): dulu tombol mode
 * langsung kirim 1-1 - masalahnya push+seed jadi 2x redeploy (lambat), dan
 * command default "npx prisma db seed" gak selalu cocok (butuh config
 * "prisma.seed" di package.json, atau runner beda kalau seed file .ts).
 * Sekarang: 1 textarea command yang bisa diedit/digabung bebas sebelum
 * kirim - tombol quick-fill cuma starting point, bukan aksi final.
 */
export default function CoolifyMigrateScreen() {
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;
  const [command, setCommand] = useState('npx prisma db push');
  const [lastSent, setLastSent] = useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      if (!command.trim()) throw new ApiError('Command kosong.', 'EMPTY_COMMAND');
      return runCompanionDbMigrate({
        applicationUuid: selectedProject.applicationUuid,
        customCommand: command.trim(),
        confirmed,
      });
    },
    onSuccess: (res) => {
      setLastSent(res.command);
      Alert.alert(
        'Command Terkirim',
        `"${res.command}" udah dikirim ke Post-deployment Command Coolify.\n\nBELUM otomatis jalan - trigger Redeploy (card Coolify di Dashboard) biar command ini beneran dieksekusi.`
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        Alert.alert(
          'Konfirmasi',
          'Command ini bisa berakibat perubahan permanen di database (push force / seed berkali-kali / dll). Lanjut kirim?',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Lanjut', style: 'destructive', onPress: () => runMutation.mutate(true) },
          ]
        );
        return;
      }
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  function quickFill(cmd: string) {
    setCommand((prev) => {
      if (!prev.trim()) return cmd;
      // Kalau udah ada isinya, tawarin gabung (&&) daripada ketimpa - biar gampang compose "push && seed".
      return `${prev.trim()} && ${cmd}`;
    });
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta. Mengirim command ke Post-deployment Command Coolify - BELUM langsung eksekusi, wajib Redeploy manual
          setelah ini. Tap tombol di bawah buat isi cepat, boleh diedit/digabung ("&&") sebelum kirim.
        </Text>
      </Card>

      {projects.length > 1 && (
        <Card>
          <Text style={styles.label}>Project</Text>
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
        </Card>
      )}

      <Card>
        <Text style={styles.label}>Isi Cepat</Text>
        <View style={styles.modeRow}>
          {QUICK_FILL.map((q) => (
            <Button key={q.label} label={q.label} variant={q.risk ?? 'secondary'} onPress={() => quickFill(q.command)} />
          ))}
          <Button label="Kosongkan" variant="secondary" onPress={() => setCommand('')} />
        </View>
      </Card>

      <Card>
        <FormField
          label={`Command — ${selectedProject?.name ?? '-'}`}
          value={command}
          onChangeText={setCommand}
          multiline
          numberOfLines={3}
          autoCapitalize="none"
          style={{ minHeight: 70, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="mis. npx prisma db push && npx tsx prisma/seed.ts"
        />
        <Button label="Kirim Command" loading={runMutation.isPending} onPress={() => runMutation.mutate(false)} />
      </Card>

      {lastSent && (
        <Card>
          <Text style={styles.label}>Command Terakhir Dikirim</Text>
          <Text style={styles.code}>{lastSent}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  code: { fontFamily: 'monospace', fontSize: 12.5, color: colors.ink },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
});
