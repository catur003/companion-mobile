import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AppModal } from '@/components/AppModal';
import { KeyboardScreen, useKeyboardScroll } from '@/components/KeyboardScreen';
import { colors, spacing, radius, mono } from '@/lib/theme';
import {
  getGitStatus,
  listGitBranches,
  getGitLog,
  gitPull,
  gitCheckout,
  gitStash,
  gitForceSync,
  listGithubAccounts,
  updateGitCredentials,
  runProjectBuild,
  runProjectSeed,
  ProjectBuildSteps,
  ApiError,
} from '@/lib/api';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable style={styles.toggleRow} onPress={() => onChange(!value)}>
      <Ionicons name={value ? 'checkbox' : 'square-outline'} size={20} color={value ? colors.accent : colors.inkFaint} />
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  );
}

export default function GitDetailScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const keyboardScroll = useKeyboardScroll();
  const manualUrlRef = useRef<TextInput>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');
  const [applyingLabel, setApplyingLabel] = useState<string | null>(null);
  const [installStep, setInstallStep] = useState(true);
  const [buildStep, setBuildStep] = useState(true);
  const [restartStep, setRestartStep] = useState(true);
  const [prismaMode, setPrismaMode] = useState<NonNullable<ProjectBuildSteps['prismaMode']>>('none');
  // FIXED (missing confirm): sebelumnya tombol "Jalankan Seed" langsung
  // eksekusi `prisma db seed` on-tap TANPA konfirmasi apapun - padahal
  // seed script banyak yang truncate/reset tabel dulu sebelum insert.
  // Salah tap = bisa nge-reset data di DB manapun yang lagi konek lewat
  // .env project ini (termasuk production kalau .env belum sempat diganti
  // ke staging). Sekarang wajib lewat AppModal konfirmasi dulu.
  const [confirmSeedVisible, setConfirmSeedVisible] = useState(false);

  const status = useQuery({ queryKey: ['git-status', name], queryFn: () => getGitStatus(name), enabled: Boolean(name) });
  const branches = useQuery({ queryKey: ['git-branches', name], queryFn: () => listGitBranches(name), enabled: Boolean(name) });
  const log = useQuery({ queryKey: ['git-log', name], queryFn: () => getGitLog(name), enabled: Boolean(name) });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['git-status', name] });
    qc.invalidateQueries({ queryKey: ['git-branches', name] });
    qc.invalidateQueries({ queryKey: ['git-log', name] });
  }

  const forceSyncMutation = useMutation({
    mutationFn: () => gitForceSync(name),
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Berhasil disamakan', 'Working tree sudah dipaksa sama persis dengan branch remote.');
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function confirmForceSync() {
    Alert.alert(
      'Paksa Sync ke Remote?',
      'Ini akan MEMBUANG semua perubahan lokal (termasuk file yang lagi conflict) dan menyamakan paksa ke branch remote. Tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Paksa Sync', style: 'destructive', onPress: () => forceSyncMutation.mutate() },
      ]
    );
  }

  const pullMutation = useMutation({
    mutationFn: () => gitPull(name),
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Pull selesai', 'Repo sudah di-update ke commit terbaru dari remote.');
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Terjadi kesalahan.';
      // FIX: sebelumnya cuma nampilin error mentah dari `git pull` (mis.
      // "Pulling is not possible because you have unmerged files") tanpa
      // jalan keluar apapun - Stash JUGA nolak dalam kondisi ini (git
      // secara default nolak stash kalau ada unmerged files), jadi user
      // kejebak: 2 tombol yang ada (Pull, Stash) dua-duanya gak bisa
      // dipakai. Sekarang kondisi ini dideteksi dan ditawarin jalan keluar
      // (force-sync) langsung di dialog errornya.
      const isUnmergedConflict = /unmerged files|unresolved conflict/i.test(message);
      Alert.alert(
        'Gagal Pull',
        message,
        isUnmergedConflict
          ? [
              { text: 'Tutup', style: 'cancel' },
              { text: 'Paksa Sync ke Remote', style: 'destructive', onPress: confirmForceSync },
            ]
          : undefined
      );
    },
  });

  const stashMutation = useMutation({
    mutationFn: () => gitStash(name),
    onSuccess: () => {
      invalidateAll();
      Alert.alert('Stash berhasil', 'Perubahan lokal disimpan sementara (bisa dikembalikan manual lewat `git stash pop` di server).');
    },
    onError: (err) => Alert.alert('Gagal Stash', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  async function handleCheckout(branch: string) {
    setCheckingOut(branch);
    try {
      await gitCheckout(name, branch);
      invalidateAll();
      Alert.alert('Checkout berhasil', `Sekarang di branch "${branch}".`);
    } catch (err) {
      Alert.alert('Gagal Checkout', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    } finally {
      setCheckingOut(null);
    }
  }

  const accounts = useQuery({ queryKey: ['github-accounts'], queryFn: listGithubAccounts });

  const credentialsMutation = useMutation({
    mutationFn: (opts: { accountLabel?: string; manualUrl?: string }) => updateGitCredentials(name, opts),
    onSuccess: () => {
      setApplyingLabel(null);
      setManualUrl('');
      Alert.alert('Berhasil', 'Kredensial GitHub untuk project ini sudah diperbarui.');
    },
    onError: (err) => {
      setApplyingLabel(null);
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  function applyAccount(label: string) {
    setApplyingLabel(label);
    credentialsMutation.mutate({ accountLabel: label });
  }

  function applyManualUrl() {
    if (!manualUrl.trim()) return;
    setApplyingLabel('__manual__');
    credentialsMutation.mutate({ manualUrl: manualUrl.trim() });
  }

  const buildMutation = useMutation({
    mutationFn: () => {
      const steps: ProjectBuildSteps = { install: installStep, prismaMode, build: buildStep, restartPm2: restartStep };
      return runProjectBuild(name, steps);
    },
    onSuccess: (res) => router.push(`/(tabs)/deploy/${res.jobId}`),
    onError: (err) => Alert.alert('Gagal Mulai Build', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const seedMutation = useMutation({
    mutationFn: () => runProjectSeed(name),
    onSuccess: (res) => router.push(`/(tabs)/deploy/${res.jobId}`),
    onError: (err) => Alert.alert('Gagal Mulai Seed', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const noStepsSelected = !installStep && prismaMode === 'none' && !buildStep && !restartStep;

  function confirmCheckout(branch: string) {
    const warnDirty = status.data && !status.data.isClean;
    Alert.alert(
      `Checkout ke "${branch}"?`,
      warnDirty
        ? 'Ada perubahan lokal yang belum di-commit - checkout bisa gagal atau menimpa perubahan itu. Lanjut?'
        : `Working directory akan berpindah ke branch "${branch}".`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Checkout', onPress: () => handleCheckout(branch) },
      ]
    );
  }

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: name }} />

      {status.isLoading && <Card><Text style={styles.mutedText}>Memuat status...</Text></Card>}
      {status.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal ambil status git: {(status.error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}

      {status.data && (
        <Card>
          <View style={styles.row}>
            <Text style={styles.branchName}>{status.data.branch}</Text>
            <View style={[styles.cleanChip, { backgroundColor: status.data.isClean ? colors.greenSoft : colors.amberSoft }]}>
              <Text style={{ color: status.data.isClean ? colors.green : colors.amber, fontSize: 11, fontWeight: '700' }}>
                {status.data.isClean ? 'Clean' : `${status.data.changedFiles.length} file berubah`}
              </Text>
            </View>
          </View>
          <Text style={styles.subtext}>
            {status.data.remoteCheckFailed
              ? 'Gagal fetch dari remote - ahead/behind tidak akurat.'
              : `${status.data.ahead} commit di depan · ${status.data.behind} commit di belakang remote`}
          </Text>
          {!status.data.isClean && (
            <View style={{ marginTop: spacing.sm }}>
              {status.data.changedFiles.slice(0, 8).map((f, i) => (
                <Text key={i} style={styles.fileLine} numberOfLines={1}>{f}</Text>
              ))}
              {status.data.changedFiles.length > 8 && (
                <Text style={styles.subtext}>+{status.data.changedFiles.length - 8} lainnya</Text>
              )}
            </View>
          )}
        </Card>
      )}

      <View style={styles.actionsRow}>
        <View style={{ flex: 1 }}>
          <Button label="Pull" loading={pullMutation.isPending} onPress={() => pullMutation.mutate()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Stash" variant="secondary" loading={stashMutation.isPending} onPress={() => stashMutation.mutate()} />
        </View>
      </View>
      {/* FIX: sebelumnya opsi ini cuma nongol di dalam dialog error "Gagal
          Pull" - kalau dialognya kadung ditutup (mis. keluar app dulu, balik
          lagi nanti), user gak ada cara masuk ke sini lagi selain nge-trigger
          Pull ulang buat mancing error yang sama. Sekarang selalu ada di
          bawah, kecil & gak mencolok (memang cuma dibutuhkan pas kejebak). */}
      <Pressable onPress={confirmForceSync} disabled={forceSyncMutation.isPending} style={styles.forceSyncLink}>
        <Text style={styles.forceSyncLinkText}>
          {forceSyncMutation.isPending ? 'Nge-sync...' : 'Pull/Stash gak bisa? Paksa Sync ke Remote'}
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Branch</Text>
      <Card>
        {branches.isLoading && <Text style={styles.mutedText}>Memuat...</Text>}
        {branches.isError && <Text style={{ color: colors.red, fontSize: 12 }}>Gagal ambil daftar branch.</Text>}
        {branches.data?.branches.map((b, i) => {
          const isCurrent = status.data?.branch === b;
          return (
            <Pressable
              key={b}
              disabled={isCurrent || checkingOut !== null}
              onPress={() => confirmCheckout(b)}
              style={[styles.branchRow, i > 0 && styles.rowDivider]}
            >
              <Text style={[styles.branchLabel, isCurrent && { color: colors.accent, fontWeight: '700' }]} numberOfLines={1}>
                {b}
              </Text>
              {isCurrent ? (
                <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
              ) : checkingOut === b ? (
                <Text style={styles.mutedText}>...</Text>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
              )}
            </Pressable>
          );
        })}
      </Card>

      <Text style={styles.sectionTitle}>Log Commit Terbaru</Text>
      {log.isLoading && <Card><Text style={styles.mutedText}>Memuat...</Text></Card>}
      {log.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>Gagal ambil log.</Text>
        </Card>
      )}
      {log.data && (
        <View style={styles.logBox}>
          <Text style={styles.logText}>{log.data.output || '(kosong)'}</Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Build & Seed Manual</Text>
      <Card>
        <Text style={styles.subtext}>Pilih step yang mau dijalankan (di luar alur Deploy), progress bisa dipantau di layar Job.</Text>
        <View style={{ marginTop: spacing.sm }}>
          <Toggle label="Install dependencies" value={installStep} onChange={setInstallStep} />
          <Toggle label="Build" value={buildStep} onChange={setBuildStep} />
          <Toggle label="Restart PM2 setelah selesai" value={restartStep} onChange={setRestartStep} />
        </View>
        <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Prisma</Text>
        <View style={styles.modeRow}>
          {(['none', 'generate', 'push', 'push_force', 'migrate'] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setPrismaMode(mode)}
              style={[styles.modeChip, prismaMode === mode && styles.modeChipActive, mode === 'push_force' && prismaMode === mode && styles.modeChipDanger]}
            >
              <Text style={[styles.modeChipText, prismaMode === mode && styles.modeChipTextActive]}>
                {mode === 'push_force' ? 'push (force)' : mode}
              </Text>
            </Pressable>
          ))}
        </View>
        {prismaMode === 'push_force' && (
          <Text style={styles.dangerHint}>
            ⚠ Ini jalanin `prisma db push --accept-data-loss` — dipakai kalau "push" biasa gagal karena
            perubahan schema berpotensi ngilangin data (mis. drop kolom/tabel). Project ini kemungkinan
            udah ada data produksi, pastiin udah backup database dulu sebelum lanjut.
          </Text>
        )}
        <View style={{ marginTop: spacing.md }}>
          <Button
            label="Jalankan Build"
            onPress={() => buildMutation.mutate()}
            loading={buildMutation.isPending}
            disabled={noStepsSelected}
          />
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="Jalankan Seed (prisma db seed)"
            variant="secondary"
            onPress={() => setConfirmSeedVisible(true)}
            loading={seedMutation.isPending}
          />
        </View>
      </Card>

      <AppModal
        visible={confirmSeedVisible}
        kind="warning"
        title={`Jalankan seed untuk "${name}"?`}
        message="prisma db seed akan dieksekusi terhadap database yang tersambung lewat .env project ini SEKARANG. Kalau seed script-nya truncate/reset tabel dulu, data yang ada bisa hilang. Pastikan .env sudah nunjuk ke database yang benar."
        buttons={[
          { label: 'Batal', onPress: () => setConfirmSeedVisible(false), variant: 'secondary' },
          {
            label: 'Jalankan Seed',
            variant: 'danger',
            onPress: () => {
              setConfirmSeedVisible(false);
              seedMutation.mutate();
            },
          },
        ]}
        onRequestClose={() => setConfirmSeedVisible(false)}
      />

      <Text style={styles.sectionTitle}>Environment</Text>
      <Card onPress={() => router.push(`/(tabs)/deploy/git/${encodeURIComponent(name)}/env`)}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Kelola .env</Text>
            <Text style={styles.subtext}>Lihat & timpa isi file .env project ini.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Kredensial GitHub</Text>
      <Card onPress={() => router.push('/(tabs)/deploy/github-accounts')} style={{ marginBottom: spacing.xs }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Kelola Akun Tersimpan</Text>
            <Text style={styles.subtext}>Tambah/hapus akun GitHub (label, username, token).</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
        </View>
      </Card>
      <Card>
        {accounts.isLoading && <Text style={styles.mutedText}>Memuat akun tersimpan...</Text>}
        {accounts.isError && <Text style={{ color: colors.red, fontSize: 12 }}>Gagal ambil daftar akun.</Text>}
        {accounts.data && accounts.data.accounts.length === 0 && (
          <Text style={styles.subtext}>Belum ada akun GitHub tersimpan di Configuration. Isi URL manual di bawah.</Text>
        )}
        {accounts.data?.accounts.map((a, i) => (
          <View key={a.label} style={[styles.accountRow, i > 0 && styles.rowDivider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLabel}>{a.label}</Text>
              <Text style={styles.subtext}>@{a.username}</Text>
            </View>
            <Button
              label="Pakai"
              variant="secondary"
              loading={applyingLabel === a.label}
              disabled={credentialsMutation.isPending}
              onPress={() => applyAccount(a.label)}
            />
          </View>
        ))}
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.inputLabel}>Atau isi URL remote manual</Text>
          <TextInput
            ref={manualUrlRef}
            style={styles.input}
            value={manualUrl}
            onChangeText={setManualUrl}
            onFocus={() => keyboardScroll?.scrollToInput(manualUrlRef.current)}
            placeholder="https://user:token@github.com/user/repo.git"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label="Terapkan URL Manual"
              variant="secondary"
              loading={applyingLabel === '__manual__'}
              disabled={!manualUrl.trim() || credentialsMutation.isPending}
              onPress={applyManualUrl}
            />
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Zona Berbahaya</Text>
      <Card
        onPress={() => router.push(`/(tabs)/deploy/git/${encodeURIComponent(name)}/delete`)}
        style={{ borderColor: colors.redSoft }}
      >
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.red }]}>Hapus Project</Text>
            <Text style={styles.subtext}>Hapus dari PM2/nginx, opsional database & folder. Permanen.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.red} />
        </View>
      </Card>
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  branchName: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cleanChip: { borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 10 },
  subtext: { fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 17 },
  fileLine: { fontFamily: mono.fontFamily, fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  forceSyncLink: { alignItems: 'center', paddingVertical: 6, marginBottom: spacing.md },
  forceSyncLinkText: { fontSize: 11.5, color: colors.inkFaint, textDecorationLine: 'underline' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  branchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, gap: spacing.sm },
  branchLabel: { fontSize: 13, color: colors.ink, flexShrink: 1 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  logBox: {
    backgroundColor: colors.termBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.termBorder,
    padding: spacing.md,
  },
  logText: { fontFamily: mono.fontFamily, fontSize: 11.5, lineHeight: 18, color: colors.termText },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  accountRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  accountLabel: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 13,
    color: colors.ink,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7 },
  toggleLabel: { fontSize: 13.5, color: colors.ink, fontWeight: '600' },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 6 },
  modeChip: {
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.bg,
  },
  modeChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipDanger: { backgroundColor: colors.red, borderColor: colors.red },
  dangerHint: { fontSize: 12, color: colors.red, marginTop: spacing.sm, lineHeight: 17 },
  modeChipText: { fontSize: 12, fontWeight: '700', color: colors.ink },
  modeChipTextActive: { color: colors.onAccent },
});
