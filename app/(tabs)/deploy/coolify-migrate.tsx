import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius } from '@/lib/theme';
import { runCompanionDbMigrate, listRegisteredProjects, CompanionMigrateMode } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

const MODES: { value: CompanionMigrateMode; label: string; danger?: boolean }[] = [
  { value: 'generate', label: 'Generate' },
  { value: 'push', label: 'DB Push' },
  { value: 'push_force', label: 'DB Push (Force)', danger: true },
  { value: 'migrate', label: 'Migrate Deploy' },
  { value: 'seed', label: 'DB Seed', danger: true },
];

/**
 * UI buat endpoint POST /db/migrate Companion API - backend-nya udah lama
 * jadi & tested manual (dipakai buat PORTOFOLIO via curl), ini baru bikin
 * UI-nya di ZenVPS. projectType di-hardcode "nextjs-prisma" - semua project
 * yang migrasi sejauh ini emang Next.js+Prisma (lihat dokumen migrasi
 * Bagian 3.3 soal Laravel nanti - toggle projectType baru relevan pas itu).
 */
export default function CoolifyMigrateScreen() {
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;
  const [mode, setMode] = useState<CompanionMigrateMode>('push');
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const modeInfo = MODES.find((m) => m.value === mode);

  const runMutation = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return runCompanionDbMigrate({
        projectType: 'nextjs-prisma',
        mode,
        applicationUuid: selectedProject.applicationUuid,
        confirmed,
      });
    },
    onSuccess: (res) => {
      setLastCommand(res.command);
      Alert.alert(
        'Command Terkirim',
        `"${res.command}" udah dikirim ke Post-deployment Command Coolify.\n\nBELUM otomatis jalan - trigger Redeploy (card Coolify di Dashboard) biar command ini beneran dieksekusi.`
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        Alert.alert(
          `Konfirmasi: ${modeInfo?.label}`,
          modeInfo?.danger
            ? 'Mode ini bisa berakibat KEHILANGAN DATA (push --accept-data-loss) atau nge-run seed berkali-kali. Lanjut?'
            : 'Lanjutkan aksi ini?',
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
          setelah ini buat command-nya beneran jalan.
        </Text>
      </Card>

      {projects.length > 1 && (
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

      <Card>
        <Text style={styles.label}>Mode</Text>
        <View style={styles.modeRow}>
          {MODES.map((m) => (
            <Button
              key={m.value}
              label={m.label}
              variant={mode === m.value ? (m.danger ? 'danger' : 'primary') : 'secondary'}
              onPress={() => setMode(m.value)}
            />
          ))}
        </View>
        <Button
          label={`Kirim: ${modeInfo?.label ?? mode}`}
          loading={runMutation.isPending}
          onPress={() => runMutation.mutate(false)}
        />
      </Card>

      {lastCommand && (
        <Card>
          <Text style={styles.label}>Command Terakhir Dikirim</Text>
          <Text style={styles.code}>{lastCommand}</Text>
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
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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
