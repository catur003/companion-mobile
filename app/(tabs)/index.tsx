import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { PmAppCard } from '@/components/PmAppCard';
import { FadeInUp } from '@/components/FadeInUp';
import { Button } from '@/components/Button';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, spacing, radius } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { pushIntoTab } from '@/lib/nav';
import { getMonitorStatus, listPm2Apps, savePm2Startup, ApiError } from '@/lib/api';
import { CoolifyAppCard } from '@/components/CoolifyAppCard';
import { isCoolifyConfigured } from '@/lib/storage';

// TEMPORARY (Fase 4, baru PORTOFOLIO yang pindah ke Coolify): container ID +
// applicationUuid di-hardcode di sini, BUKAN nama project - gak ada
// pemetaan nama project ke container/app yang bisa ditebak (temuan Fase 1,
// lihat DEPLOYMENT-NOTES.md di companion-api). Begitu Fase 5 jalan (project
// lain ikut pindah), ini WAJIB diganti jadi daftar dinamis.
const PORTOFOLIO_CONTAINER_ID = '76a134667c97';
// UUID application PORTOFOLIO di Coolify (confirmed 4 Agustus 2026 via
// GET /api/v1/applications - cocok juga dengan subdomain sslip.io default-nya).
const PORTOFOLIO_APPLICATION_UUID = 'bxpbj2db8xneyfquv7o9l1bk';

export default function DashboardScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();
  const monitor = useQuery({
    queryKey: ['monitor'],
    queryFn: getMonitorStatus,
    refetchInterval: 10000,
  });
  const pm2Apps = useQuery({
    queryKey: ['pm2-apps'],
    queryFn: listPm2Apps,
    refetchInterval: 10000,
  });

  // Coolify + Companion API - independen dari query vps-manager di atas.
  // Card CoolifyAppCard urus query restart-count & status-nya sendiri -
  // di sini cuma perlu tau udah dikonfigurasi atau belum, biar gak nampilin
  // card buat user yang belum migrasi apapun.
  const coolifyConfigured = useQuery({
    queryKey: ['coolify-configured'],
    queryFn: isCoolifyConfigured,
    staleTime: 5000,
  });

  const { data, isLoading, isError, error, refetch, isRefetching } = monitor;
  const refreshing = isRefetching || pm2Apps.isRefetching;

  const onRefresh = () => {
    refetch();
    pm2Apps.refetch();
  };

  const saveStartupMutation = useMutation({
    mutationFn: savePm2Startup,
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length === 0) {
        Alert.alert('Berhasil', `Startup list PM2 tersimpan untuk ${res.results.length} user.`);
      } else {
        Alert.alert('Sebagian Gagal', failed.map((r) => `${r.user}: ${r.errorMessage ?? 'gagal'}`).join('\n'));
      }
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  return (
    <View style={styles.wrap}>
      <AuroraBackground />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
      <Text style={styles.eyebrow}>ZENHUB VPS</Text>
      <Text style={styles.title}>Dashboard</Text>

      {isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal ambil status server: {(error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}

      {!isError && (
        <>
          <LinearGradient
            colors={[colors.accent, colors.accentPink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.banner}
          >
            <View>
              <Text style={styles.bannerTitle}>{isLoading ? 'Menghubungkan...' : 'Server Online'}</Text>
              <Text style={styles.bannerSub}>
                {data ? `Uptime ${data.uptime ?? '—'} · CPU ${data.cpuPercent != null ? `${data.cpuPercent}%` : '—'}` : ' '}
              </Text>
            </View>
            <Ionicons name="cloud-outline" size={26} color={colors.onAccent} style={{ opacity: 0.9 }} />
          </LinearGradient>

          {data && (
            <Card>
              <Metric label="CPU" value={data.cpuPercent != null ? `${data.cpuPercent}%` : '—'} />
              <ProgressBar percent={data.cpuPercent} />

              <Metric
                label="RAM"
                value={data.ram ? `${data.ram.percent}% · ${data.ram.usedMB}/${data.ram.totalMB} MB` : '—'}
                topGap
              />
              <ProgressBar percent={data.ram?.percent} />

              <Metric
                label="Disk"
                value={data.disk ? `${data.disk.percent}% · ${data.disk.used}/${data.disk.total}` : '—'}
                topGap
              />
              <ProgressBar percent={data.disk?.percent} />

              <Metric
                label="Load Average"
                value={data.loadAverage ? `${data.loadAverage['1min']} / ${data.loadAverage['5min']} / ${data.loadAverage['15min']}` : '—'}
                topGap
              />
            </Card>
          )}
        </>
      )}

      <Text style={styles.sectionTitle}>Aksi Cepat</Text>
      <View style={styles.quickGrid}>
        <QuickAction icon="server-outline" iconBg={colors.accentSoft} label="Database" onPress={() => router.push('/(tabs)/database')} />
        <QuickAction
          icon="rocket-outline"
          iconBg={colors.accentPinkSoft}
          label="Deploy Baru"
          onPress={() => pushIntoTab(router, '/(tabs)/deploy', '/(tabs)/deploy/new')}
        />
        <QuickAction
          icon="lock-closed-outline"
          iconBg={colors.greenSoft}
          label="Terbitkan SSL"
          onPress={() => pushIntoTab(router, '/(tabs)/deploy', '/(tabs)/deploy/ssl')}
        />
        <QuickAction
          icon="add-circle-outline"
          iconBg={colors.blueSoft}
          label="Buat DB Baru"
          onPress={() => pushIntoTab(router, '/(tabs)/database', '/(tabs)/database/create')}
        />
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>App yang Jalan</Text>
        <Button
          label="Simpan Startup"
          variant="secondary"
          loading={saveStartupMutation.isPending}
          onPress={() => saveStartupMutation.mutate()}
        />
      </View>
      {pm2Apps.isLoading && <Card><Text style={styles.mutedText}>Memuat daftar app...</Text></Card>}
      {pm2Apps.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal ambil daftar app: {(pm2Apps.error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}
      {!pm2Apps.isLoading && !pm2Apps.isError && (pm2Apps.data?.apps.length ?? 0) === 0 && (
        <Card><Text style={styles.mutedText}>Belum ada app yang terdaftar.</Text></Card>
      )}
      {!pm2Apps.isLoading && !pm2Apps.isError && pm2Apps.data?.apps.map((app, i) => (
        <FadeInUp key={`${app.owner}:${app.name}`} index={i}>
          <PmAppCard app={app} />
        </FadeInUp>
      ))}
      {(pm2Apps.data?.warnings?.length ?? 0) > 0 && (
        <Text style={styles.warningText}>
          {pm2Apps.data!.warnings.join(' | ')}
        </Text>
      )}

      {coolifyConfigured.data === true && (
        <>
          <Text style={styles.sectionTitle}>Coolify (Beta)</Text>
          <CoolifyAppCard
            name="PORTOFOLIO"
            applicationUuid={PORTOFOLIO_APPLICATION_UUID}
            containerId={PORTOFOLIO_CONTAINER_ID}
          />
        </>
      )}
      </ScrollView>
    </View>
  );
}

function Metric({ label, value, topGap }: { label: string; value: string; topGap?: boolean }) {
  return (
    <View style={[styles.metricRow, topGap && { marginTop: spacing.sm }]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  iconBg,
  label,
  onPress,
}: {
  icon: any;
  iconBg: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.quickCard}>
      <View style={[styles.quickIconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={colors.ink} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  // AuroraBackground perlu induk yang punya ukuran pasti buat absoluteFill -
  // ScrollView sendirian gak cukup (tingginya ngikutin konten, bukan layar).
  wrap: { flex: 1 },
  // transparent - AuroraBackground dipasang di dalam `wrap` di atas, sebagai
  // saudara SEBELUM ScrollView ini (lihat return statement).
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },
  banner: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bannerTitle: { color: colors.onAccent, fontSize: 15, fontWeight: '700' },
  bannerSub: { color: colors.onAccent, fontSize: 11.5, opacity: 0.9, marginTop: 2 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  metricLabel: { fontSize: 12, color: colors.inkMuted },
  metricValue: { fontSize: 12, fontWeight: '700', color: colors.ink },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickCard: { width: '47%', alignItems: 'flex-start', gap: 8 },
  quickIconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  warningText: { fontSize: 11, color: colors.amber, marginTop: spacing.xs, lineHeight: 16 },
});
