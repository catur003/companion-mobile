import { useState } from 'react';
import { StyleSheet, Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { getJob, getProjectEnv, retryDeploy, ApiError, DeployPayload } from '@/lib/api';

const PRISMA_MODES: NonNullable<DeployPayload['prismaMode']>[] = ['none', 'generate', 'push', 'push_force', 'migrate'];
// 'push_force' = db push --accept-data-loss. Dipakai kalau step "push" biasa
// berhenti gara-gara prisma minta konfirmasi data loss (kolom/tabel yang
// berpotensi kehilangan data karena perubahan schema). 'migrate' TIDAK
// pernah butuh varian force - prisma migrate deploy gak punya flag itu.
const PRISMA_MODE_LABELS: Record<NonNullable<DeployPayload['prismaMode']>, string> = {
  none: 'none',
  generate: 'generate',
  push: 'push',
  push_force: 'push (force)',
  migrate: 'migrate',
};

export default function RetryDeployScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: job, isLoading } = useQuery({ queryKey: ['job', jobId], queryFn: () => getJob(jobId) });

  // job.params.envContent SELALU balik sebagai "[REDACTED]" dari API (lihat
  // jobStore.js SENSITIVE_KEY_PATTERN - sengaja disamarkan biar secret di
  // .env gak numpang lewat lewat response job) - jadi gak bisa dipakai buat
  // nunjukin isi .env yang SEKARANG beneran ke user. Diambil terpisah lewat
  // endpoint .env project asli (sama kayak layar edit .env biasa), supaya
  // placeholder di bawah nunjukin isi nyata, bukan literal "[REDACTED]".
  const projectName = job?.params?.name as string | undefined;
  const { data: currentEnv } = useQuery({
    queryKey: ['project-env', projectName],
    queryFn: () => getProjectEnv(projectName as string),
    enabled: Boolean(projectName),
  });

  const [envContent, setEnvContent] = useState<string | null>(null);
  const [port, setPort] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [prismaMode, setPrismaMode] = useState<DeployPayload['prismaMode'] | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      retryDeploy(jobId, {
        envContent: envContent ?? undefined,
        port: port ? Number(port) : undefined,
        domain: domain || undefined,
        branch: branch || undefined,
        prismaMode: prismaMode || undefined,
      }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      router.replace(`/(tabs)/deploy/${result.jobId}`);
    },
    onError: (err) => Alert.alert('Gagal retry', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  if (isLoading || !job) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Memuat job...</Text>
      </View>
    );
  }

  const original = job.params as unknown as DeployPayload;

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Retry Deploy' }} />
      <Text style={styles.intro}>
        Berhenti terakhir di step <Text style={styles.bold}>{job.stoppedAtKey}</Text>. Kosongkan field kalau gak mau
        diubah — cuma yang diisi ulang yang bakal dipakai. Ubah <Text style={styles.bold}>.env</Text>/port/domain di
        sini bakal otomatis nge-rerun step yang relevan, bukan cuma nyambung dari step gagal.
      </Text>
      <Card>
        <FormField
          label={`Isi .env (kosongkan = pakai yang lama)`}
          placeholder={currentEnv?.content || '(kosong)'}
          multiline
          numberOfLines={5}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
          value={envContent ?? ''}
          onChangeText={setEnvContent}
        />
        <FormField
          label={`Port (sekarang: ${original.port})`}
          placeholder={String(original.port)}
          keyboardType="number-pad"
          value={port ?? ''}
          onChangeText={setPort}
        />
        <FormField
          label={`Domain (sekarang: ${original.domain})`}
          placeholder={original.domain}
          keyboardType="url"
          value={domain ?? ''}
          onChangeText={setDomain}
        />
        <FormField
          label={`Branch (sekarang: ${original.branch || 'default'})`}
          placeholder={original.branch || 'main'}
          value={branch ?? ''}
          onChangeText={setBranch}
        />
      </Card>
      <Card>
        <Text style={styles.label}>Mode Prisma (sekarang: {original.prismaMode || 'none'})</Text>
        <View style={styles.modeRow}>
          {PRISMA_MODES.map((mode) => (
            <Button
              key={mode}
              label={PRISMA_MODE_LABELS[mode]}
              variant={prismaMode === mode ? 'primary' : 'secondary'}
              onPress={() => setPrismaMode(mode)}
            />
          ))}
        </View>
      </Card>
      <Button label="Lanjutkan Retry" loading={mutation.isPending} onPress={() => mutation.mutate()} />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  muted: { fontSize: 13, color: colors.inkMuted },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  bold: { fontWeight: '700', color: colors.ink },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
