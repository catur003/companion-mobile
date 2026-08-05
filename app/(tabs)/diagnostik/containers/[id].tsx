import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { StatusPill } from '@/components/StatusPill';
import { colors, spacing } from '@/lib/theme';
import { getDiagnosticContainerDetail } from '@/lib/companionApi';

export default function DiagnosticContainerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['diagnostic-container-detail', id],
    queryFn: () => getDiagnosticContainerDetail(id),
    enabled: Boolean(id),
    // Stats resource berubah tiap detik - poll sedang biar kerasa "live"
    // tanpa bikin Companion API kebanjiran request.
    refetchInterval: 5000,
  });

  const d = query.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.accent} />}
    >
      {query.isLoading && (
        <Card>
          <Text style={styles.mutedText}>Memuat detail container...</Text>
        </Card>
      )}

      {query.isError && (
        <Card>
          <Text style={styles.errorText}>Gagal ambil detail container. Tarik ke bawah buat coba lagi.</Text>
        </Card>
      )}

      {d && (
        <>
          <Card>
            <View style={styles.row}>
              <Text style={styles.name} numberOfLines={1}>{d.name}</Text>
              <StatusPill status={d.state} />
            </View>
            <Text style={styles.mono}>{d.image}</Text>
          </Card>

          {d.resources && (
            <Card>
              <Text style={styles.sectionTitle}>Resource</Text>
              <Metric label="CPU" value={`${d.resources.cpuPercent}%`} warn={d.resources.cpuPercent > 80} />
              <Metric
                label="Memory"
                value={`${d.resources.memUsageMB} MB / ${d.resources.memLimitMB} MB (${d.resources.memPercent}%)`}
                warn={d.resources.memPercent > 80}
              />
              <Metric label="Network I/O" value={`↓ ${d.resources.netRxMB} MB  ↑ ${d.resources.netTxMB} MB`} />
              <Metric label="Block I/O" value={`read ${d.resources.blockReadMB} MB  write ${d.resources.blockWriteMB} MB`} />
              {d.resources.pids !== null && <Metric label="PIDs" value={String(d.resources.pids)} />}
            </Card>
          )}
          {d.resourcesError && (
            <Card>
              <Text style={styles.errorText}>{d.resourcesError}</Text>
            </Card>
          )}
          {d.state !== 'running' && !d.resourcesError && (
            <Card>
              <Text style={styles.mutedText}>Container gak lagi jalan - stats cuma tersedia buat container running.</Text>
            </Card>
          )}

          <Card>
            <Text style={styles.sectionTitle}>Info Dasar</Text>
            <Metric label="ID" value={d.id} mono />
            <Metric label="Restart Count" value={d.restartCount !== null ? String(d.restartCount) : '-'} />
            <Metric label="Restart Policy" value={d.restartPolicy} />
            <Metric label="Started" value={d.startedAt ?? '-'} />
            {d.finishedAt && <Metric label="Finished" value={d.finishedAt} />}
            <Metric label="Network" value={d.networks.join(', ') || '-'} />
          </Card>

          {d.ports.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Port</Text>
              {d.ports.map((p, i) => (
                <Metric key={i} label={p.containerPort} value={p.hostBindings.join(', ') || '(tidak di-publish)'} mono />
              ))}
            </Card>
          )}

          {d.mounts.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Mount</Text>
              {d.mounts.map((m, i) => (
                <View key={i} style={styles.mountRow}>
                  <Text style={styles.mono} numberOfLines={1}>{m.source}</Text>
                  <Text style={styles.mutedTextSmall}>→ {m.destination} {m.readOnly ? '(ro)' : '(rw)'}</Text>
                </View>
              ))}
            </Card>
          )}

          {d.env.length > 0 && (
            <Card>
              <Text style={styles.sectionTitle}>Environment Variables</Text>
              <Text style={styles.envHint}>Nilai yang sensitif (password/token/secret/dst) udah di-mask dari server.</Text>
              {d.env.map((e, i) => (
                <Metric key={i} label={e.key} value={e.value} mono />
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Metric({ label, value, mono, warn }: { label: string; value: string; mono?: boolean; warn?: boolean }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, mono && styles.mono, warn && styles.warnValue]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  mutedTextSmall: { fontSize: 11, color: colors.inkFaint },
  errorText: { fontSize: 13, color: colors.red, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1, marginRight: spacing.sm },
  mono: { fontSize: 11.5, fontFamily: 'monospace', color: colors.inkMuted },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkFaint,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: spacing.sm },
  metricLabel: { fontSize: 12, color: colors.inkMuted, flexShrink: 0, maxWidth: '45%' },
  metricValue: { fontSize: 12, fontWeight: '700', color: colors.ink, flexShrink: 1, textAlign: 'right' },
  warnValue: { color: colors.red },
  envHint: { fontSize: 11, color: colors.inkFaint, marginBottom: spacing.xs, lineHeight: 15 },
  mountRow: { paddingVertical: 5 },
});
