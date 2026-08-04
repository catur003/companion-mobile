import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { StatusPill } from '@/components/StatusPill';
import { TerminalLog } from '@/components/TerminalLog';
import { Button } from '@/components/Button';
import { colors, spacing } from '@/lib/theme';
import { getJob, Job } from '@/lib/api';

const TYPE_LABEL: Record<string, string> = {
  deploy_nextjs: 'Deploy Next.js',
  deploy_nextjs_retry: 'Retry Deploy',
  ssl_issue: 'Terbitkan SSL',
  project_build: 'Build Manual',
  project_seed: 'Seed Manual',
};

function buildLogText(job: Job): string {
  const lines = [
    `Job: ${job.id}`,
    `Tipe: ${TYPE_LABEL[job.type] ?? job.type}`,
    `Status: ${job.status}`,
    `Dibuat: ${new Date(job.createdAt).toLocaleString('id-ID')}`,
    job.message ? `Pesan: ${job.message}` : null,
    '',
    ...job.steps.map((s) => {
      const mark = s.ok ? '[OK]' : '[GAGAL]';
      const base = `${mark} ${s.step}`;
      return s.message ? `${base}\n      ${s.message}` : base;
    }),
  ].filter(Boolean);
  return lines.join('\n');
}

export default function JobDetailScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const router = useRouter();

  const { data: job, isLoading, isError, error } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId),
    enabled: Boolean(jobId),
    // Polling cepat selagi job masih jalan, berhenti otomatis begitu selesai -
    // biar gak nge-hit API terus-terusan setelah job kelar.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'pending' ? 2000 : false;
    },
  });

  async function handleCopyLog() {
    if (!job) return;
    await Clipboard.setStringAsync(buildLogText(job));
    Alert.alert('Disalin', 'Log job ini sudah disalin ke clipboard.');
  }

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>Memuat job...</Text>
      </View>
    );
  }

  if (isError || !job) {
    return (
      <View style={[styles.screen, { padding: spacing.lg }]}>
        <Text style={styles.errText}>{(error as Error)?.message ?? 'Job tidak ditemukan.'}</Text>
      </View>
    );
  }

  // FIX: sebelumnya cuma job.type === 'deploy_nextjs' (attempt pertama) yang
  // dianggap bisa di-retry, jadi begitu sebuah RETRY gagal lagi (tipe job-nya
  // jadi 'deploy_nextjs_retry'), tombol retry hilang total dari halaman itu -
  // padahal backend sekarang (lihat deploy.routes.js) sudah bisa nerima retry
  // dari job hasil retry juga.
  const canRetry =
    (job.type === 'deploy_nextjs' || job.type === 'deploy_nextjs_retry') &&
    job.status === 'failed' &&
    Boolean(job.stoppedAtKey);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: TYPE_LABEL[job.type] ?? job.type }} />
      <Card>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{String(job.params.name ?? job.params.pm2Name ?? job.params.domain ?? job.id.slice(0, 8))}</Text>
            <Text style={styles.meta}>{new Date(job.createdAt).toLocaleString('id-ID')}</Text>
          </View>
          <StatusPill status={job.status} />
        </View>
        {job.message ? <Text style={styles.message}>{job.message}</Text> : null}
      </Card>

      <View style={styles.logHeader}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Log Proses</Text>
        <Button label="Salin Log" variant="secondary" onPress={handleCopyLog} />
      </View>
      <TerminalLog steps={job.steps} liveMessage={job.status === 'running' ? job.message : undefined} />

      {canRetry && (
        <View style={{ marginTop: spacing.lg }}>
          <Button
            label={`Retry dari step "${job.stoppedAtKey}" (bisa ubah env/port/domain)`}
            onPress={() => router.push(`/(tabs)/deploy/${job.id}/retry`)}
          />
        </View>
      )}

      {(job.type === 'deploy_nextjs' || job.type === 'deploy_nextjs_retry') && job.status === 'failed' && !job.stoppedAtKey && (
        <Text style={[styles.muted, { marginTop: spacing.md }]}>
          Job ini gagal sebelum sempat clone folder — belum ada yang bisa dilanjutkan. Ulangi dari awal lewat "Deploy
          Baru".
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  muted: { fontSize: 13, color: colors.inkMuted },
  errText: { fontSize: 13, color: colors.red },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
  message: { fontSize: 12.5, color: colors.inkMuted, marginTop: spacing.sm, lineHeight: 18 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
});
