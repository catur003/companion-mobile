import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatusPill } from '@/components/StatusPill';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, spacing, radius } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { pushIntoTab } from '@/lib/nav';
import { getSystemSshConfig } from '@/lib/companionApi';
import { getServerResources, getServerDomains, listCoolifyServers } from '@/lib/coolifyApi';
import { isCompanionConfigured, isCoolifyConfigured } from '@/lib/storage';

/**
 * REDESIGN (5 Agustus 2026) - dulu isinya Firewall/Fail2ban/SSH Config/Port/
 * "Kesiapan Sistem" (doctor)/"Scan Server" SEMUA manggil backend vps-manager
 * yang sekarang MATI TOTAL (butuh sudo yang gak bisa disetel programatik).
 *
 * Firewall & Fail2ban DIBUANG total (keputusan user) - dua-duanya SECARA
 * TEKNIS gak bisa dicek tanpa sudo (ufw di-gate root, fail2ban socket
 * root-only), bukan soal males setup.
 * SSH Config & Open Ports di-PORT ke Companion API (gak butuh sudo, tapi
 * info bisa kepotong - lihat catatan di system/security.js Companion API).
 * "Kesiapan Sistem"/"Scan Server" (registry PM2 vps-manager) DIBUANG total,
 * gak ada padanan di model Coolify (app di Docker, bukan PM2 - sama alasan
 * kayak PM2 info di-skip di CoolifyAppCard).
 */
export default function DiagnostikScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();

  const companionConfigured = useQuery({ queryKey: ['companion-configured'], queryFn: isCompanionConfigured, staleTime: 5000 });
  const sshConfig = useQuery({
    queryKey: ['system-ssh-config'],
    queryFn: getSystemSshConfig,
    enabled: companionConfigured.data === true,
  });

  // Section "Coolify" - endpoint LANGSUNG dari Coolify API (resources/
  // domains), TANPA backend baru sama sekali.
  const coolifyConfigured = useQuery({ queryKey: ['coolify-configured'], queryFn: isCoolifyConfigured, staleTime: 5000 });
  const coolifyServersQuery = useQuery({
    queryKey: ['coolify-servers'],
    queryFn: listCoolifyServers,
    enabled: coolifyConfigured.data === true,
  });
  const coolifyServerUuid = coolifyServersQuery.data?.[0]?.uuid; // auto-pick kalau cuma 1, sama pola kayak fitur lain
  const coolifyResourcesQuery = useQuery({
    queryKey: ['coolify-resources', coolifyServerUuid],
    queryFn: () => getServerResources(coolifyServerUuid!),
    enabled: Boolean(coolifyServerUuid),
  });
  const coolifyDomainsQuery = useQuery({
    queryKey: ['coolify-domains', coolifyServerUuid],
    queryFn: () => getServerDomains(coolifyServerUuid!),
    enabled: Boolean(coolifyServerUuid),
  });

  const refreshing = sshConfig.isRefetching || coolifyResourcesQuery.isRefetching;
  const onRefresh = () => {
    if (companionConfigured.data === true) {
      sshConfig.refetch();
    }
    if (coolifyServerUuid) {
      coolifyResourcesQuery.refetch();
      coolifyDomainsQuery.refetch();
    }
  };

  return (
    <View style={styles.wrap}>
      <AuroraBackground />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
      <Text style={styles.eyebrow}>ZENHUB VPS</Text>
      <Text style={styles.title}>Diagnostik</Text>

      <Button
        label="Buka Terminal SSH"
        variant="secondary"
        onPress={() => pushIntoTab(router, '/(tabs)/deploy', '/(tabs)/deploy/ssh-terminal')}
      />

      {companionConfigured.data === true && (
        <>
          <Text style={styles.sectionTitle}>Keamanan</Text>

          <Card>
            <Text style={styles.rowLabel}>Konfigurasi SSH</Text>
            {sshConfig.isLoading && <Text style={styles.mutedText}>Mengecek...</Text>}
            {sshConfig.isError && <Text style={styles.errorTextSmall}>Gagal ambil data.</Text>}
            {sshConfig.data && !sshConfig.data.ok && (
              <Text style={styles.subtext}>{sshConfig.data.errorMessage ?? 'sshd_config tidak terbaca.'}</Text>
            )}
            {sshConfig.data?.ok && sshConfig.data.settings && (
              <View style={{ marginTop: spacing.xs }}>
                {Object.entries(sshConfig.data.settings).map(([key, value]) => (
                  <View key={key} style={styles.metricRow}>
                    <Text style={styles.metricLabel}>{key}</Text>
                    <Text
                      style={[
                        styles.metricValue,
                        key === 'PermitRootLogin' && value.toLowerCase() === 'yes' && styles.warnValue,
                        key === 'PasswordAuthentication' && value.toLowerCase() === 'yes' && styles.warnValue,
                      ]}
                    >
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

        </>
      )}

      {coolifyConfigured.data === true && (
        <>
          <Text style={styles.sectionTitle}>Coolify</Text>
          <Card>
            <Row
              label="Resource di Server"
              right={<Text style={styles.metricValue}>{coolifyResourcesQuery.data?.length ?? '-'} resource</Text>}
            />
            {coolifyResourcesQuery.data?.map((r, i) => (
              <View key={r.uuid ?? i} style={[styles.metricRow, styles.rowDivider]}>
                <Text style={styles.metricLabel} numberOfLines={1}>{r.name}</Text>
                <StatusPill status={String(r.status ?? r.type ?? '-')} />
              </View>
            ))}
          </Card>

          {(coolifyDomainsQuery.data?.length ?? 0) > 0 && (
            <Card>
              <Text style={styles.rowLabel}>Domain Terdaftar</Text>
              {coolifyDomainsQuery.data!.map((d, i) => {
                const isSslip = d.includes('.sslip.io');
                return (
                  <View key={i} style={styles.domainRow}>
                    <View style={[styles.domainDot, isSslip ? styles.domainDotSslip : styles.domainDotCustom]} />
                    <Text style={styles.domainText} numberOfLines={1}>{d}</Text>
                    <Text style={styles.domainBadge}>{isSslip ? 'sslip.io' : 'custom'}</Text>
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}

      {companionConfigured.data === true && (
        <Button
          label="Container Docker (ps / stats / inspect)"
          variant="secondary"
          onPress={() => router.push('/(tabs)/diagnostik/containers')}
        />
      )}

      {companionConfigured.data === true && (
        <Button
          label="Riwayat Aktivitas (Audit Log)"
          variant="secondary"
          onPress={() => router.push('/(tabs)/diagnostik/audit-log')}
        />
      )}

      {companionConfigured.data !== true && coolifyConfigured.data !== true && (
        <Card>
          <Text style={styles.subtext}>Belum ada koneksi Companion API/Coolify - isi dulu di Setelan.</Text>
        </Card>
      )}
      </ScrollView>
    </View>
  );
}

function Row({ label, right }: { label: string; right: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  // AuroraBackground perlu induk yang punya ukuran pasti buat absoluteFill.
  wrap: { flex: 1 },
  // transparent - AuroraBackground dipasang di dalam `wrap` di atas.
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg, gap: spacing.md },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  subtext: { fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 17 },
  mutedText: { fontSize: 12, color: colors.inkMuted },
  errorTextSmall: { fontSize: 12, color: colors.red, fontWeight: '700' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.sm },
  metricLabel: { fontSize: 12, color: colors.inkMuted, flexShrink: 0 },
  metricValue: { fontSize: 12, fontWeight: '700', color: colors.ink, flexShrink: 1, textAlign: 'right' },
  warnValue: { color: colors.amber },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
  domainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  domainDot: { width: 6, height: 6, borderRadius: 3 },
  domainDotSslip: { backgroundColor: colors.amber },
  domainDotCustom: { backgroundColor: colors.green },
  domainText: { fontSize: 12, color: colors.inkMuted, flex: 1, fontFamily: 'monospace' },
  domainBadge: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
