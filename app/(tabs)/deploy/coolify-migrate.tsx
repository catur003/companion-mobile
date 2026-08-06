import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { runCompanionDbMigrate, listRegisteredProjects, generateLaravelKey } from '@/lib/companionApi';
import { setCoolifyApplicationEnvsBulk, restartCoolifyApplication } from '@/lib/coolifyApi';
import { ApiError } from '@/lib/api';

// Tombol "isi otomatis" - ngisi textarea command, BUKAN langsung kirim.
// User bisa edit/gabung sebelum kirim (mis. tempel "&& npx tsx prisma/seed.ts"
// abis "push" buat 1x kirim gak 2x redeploy, atau ganti runner seed kalau
// generate-nya gak cocok sama struktur project).
const QUICK_FILL_NEXTJS: { label: string; command: string; risk?: 'danger' | 'warning' }[] = [
  { label: 'Generate', command: 'npx prisma generate' },
  { label: 'DB Push', command: 'npx prisma db push' },
  { label: 'DB Push (Force)', command: 'npx prisma db push --accept-data-loss', risk: 'danger' },
  { label: 'Migrate Deploy', command: 'npx prisma migrate deploy' },
  { label: 'DB Seed', command: 'npx prisma db seed', risk: 'warning' },
];

// Laravel (BARU 6 Agustus 2026) - dari nixpacks.toml CetakPro, project
// Laravel jalan lewat supervisor (nginx+php-fpm), post-deployment command-nya
// tetap sama mekanismenya (field Post-deployment Coolify) - cuma command-nya
// beda sintaks (artisan, bukan prisma CLI).
const QUICK_FILL_LARAVEL: { label: string; command: string; risk?: 'danger' | 'warning' }[] = [
  { label: 'Migrate', command: 'php artisan migrate' },
  { label: 'Migrate (Force)', command: 'php artisan migrate --force', risk: 'danger' },
  { label: 'DB Seed', command: 'php artisan db:seed', risk: 'warning' },
  { label: 'Config Cache', command: 'php artisan config:cache' },
  { label: 'Route Cache', command: 'php artisan route:cache' },
  { label: 'Optimize Clear', command: 'php artisan optimize:clear' },
];

const DEFAULT_COMMAND = { nextjs: 'npx prisma db push', laravel: 'php artisan migrate --force' } as const;

/**
 * UI buat endpoint POST /db/migrate. UBAH (4 Agustus 2026): dulu tombol mode
 * langsung kirim 1-1 - masalahnya push+seed jadi 2x redeploy (lambat), dan
 * command default "npx prisma db seed" gak selalu cocok (butuh config
 * "prisma.seed" di package.json, atau runner beda kalau seed file .ts).
 * Sekarang: 1 textarea command yang bisa diedit/digabung bebas sebelum
 * kirim - tombol quick-fill cuma starting point, bukan aksi final.
 *
 * UPDATE (6 Agustus 2026) - Support Laravel: quick-fill & default command
 * ganti otomatis based on `project.type`, plus section APP_KEY khusus
 * Laravel di bawah (2 langkah kepisah - generate lalu terapkan - JANGAN
 * digabung, lihat komentar di companionApi.ts:generateLaravelKey).
 */
export default function CoolifyMigrateScreen() {
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;
  const isLaravel = selectedProject?.type === 'laravel';
  const quickFillList = isLaravel ? QUICK_FILL_LARAVEL : QUICK_FILL_NEXTJS;

  const [command, setCommand] = useState(DEFAULT_COMMAND.nextjs);
  const [lastSent, setLastSent] = useState<string | null>(null);

  // Ganti default command pas pindah project BEDA TIPE - biar gak kejadian
  // user pindah dari project Next.js ke Laravel tapi textarea masih keisi
  // "npx prisma db push" (command itu gak relevan/bakal gagal di Laravel).
  useEffect(() => {
    setCommand(DEFAULT_COMMAND[isLaravel ? 'laravel' : 'nextjs']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.key]);

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
        <Text style={styles.label}>Isi Cepat {isLaravel ? '(Laravel)' : '(Next.js/Prisma)'}</Text>
        <View style={styles.modeRow}>
          {quickFillList.map((q) => (
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

      {isLaravel && selectedProject && <AppKeySection applicationUuid={selectedProject.applicationUuid} />}
    </ScrollView>
  );
}

/**
 * Section APP_KEY - SENGAJA komponen terpisah + 2 mutation kepisah (generate
 * vs terapkan), BUKAN 1 tombol "generate & apply" langsung. Alasan (dari
 * diskusi ZenVPS 6 Agustus 2026): ganti APP_KEY app yang UDAH JALAN bikin
 * semua session/cookie/data terenkripsi lama rusak - user WAJIB liat dulu
 * key-nya, sadar konsekuensinya, baru pencet "Terapkan" secara eksplisit.
 */
function AppKeySection({ applicationUuid }: { applicationUuid: string }) {
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: () => generateLaravelKey(applicationUuid),
    onSuccess: (key) => setGeneratedKey(key),
    onError: (err) => Alert.alert('Gagal Generate', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!generatedKey) throw new ApiError('Generate key dulu.', 'NO_KEY');
      await setCoolifyApplicationEnvsBulk(applicationUuid, [{ key: 'APP_KEY', value: generatedKey }]);
      await restartCoolifyApplication(applicationUuid); // redeploy biar env baru kepake
    },
    onSuccess: () => {
      Alert.alert('APP_KEY Diterapkan', 'Env var APP_KEY udah di-set & redeploy udah di-trigger.');
      setGeneratedKey(null);
    },
    onError: (err) => Alert.alert('Gagal Terapkan', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function handleApplyPress() {
    Alert.alert(
      'Yakin timpa APP_KEY?',
      'Semua session/cookie/data yang udah ke-encrypt pakai APP_KEY LAMA bakal rusak permanen (gak bisa dibaca lagi). App bakal auto-redeploy setelah ini.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Timpa', style: 'destructive', onPress: () => applyMutation.mutate() },
      ]
    );
  }

  return (
    <Card>
      <Text style={styles.label}>APP_KEY (Laravel)</Text>
      <Text style={[styles.subtext, { marginBottom: spacing.sm }]}>
        `key:generate --show` doang, gak nulis apa-apa - aman diulang. Nge-set jadi APP_KEY beneran itu langkah
        terpisah di bawah.
      </Text>
      <Button label="Generate Key" variant="secondary" loading={generateMutation.isPending} onPress={() => generateMutation.mutate()} />
      {generatedKey && (
        <>
          <View style={styles.keyPreview}>
            <Text style={styles.code} selectable>{generatedKey}</Text>
          </View>
          <Button label="Terapkan sebagai APP_KEY" variant="danger" loading={applyMutation.isPending} onPress={handleApplyPress} />
        </>
      )}
    </Card>
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
  subtext: { fontSize: 11.5, color: colors.inkFaint, lineHeight: 16 },
  keyPreview: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
});
