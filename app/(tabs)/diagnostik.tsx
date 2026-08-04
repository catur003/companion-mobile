import { View, Text, StyleSheet, ScrollView, RefreshControl, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { StatusPill } from '@/components/StatusPill';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, spacing, radius } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { pushIntoTab } from '@/lib/nav';
import {
  getFirewallStatus,
  getFail2banStatus,
  getSshConfigStatus,
  listOpenPorts,
  scanFull,
  getDoctorPermissions,
} from '@/lib/api';

export default function DiagnostikScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();
  const firewall = useQuery({ queryKey: ['sec-firewall'], queryFn: getFirewallStatus });
  const fail2ban = useQuery({ queryKey: ['sec-fail2ban'], queryFn: getFail2banStatus });
  const ssh = useQuery({ queryKey: ['sec-ssh'], queryFn: getSshConfigStatus });
  const ports = useQuery({ queryKey: ['sec-ports'], queryFn: listOpenPorts });
  const scan = useQuery({ queryKey: ['scan-full'], queryFn: scanFull, enabled: false, retry: false });
  const doctor = useQuery({ queryKey: ['doctor-permissions'], queryFn: getDoctorPermissions });

  const refreshing = firewall.isRefetching || fail2ban.isRefetching || ssh.isRefetching || ports.isRefetching || doctor.isRefetching;
  const onRefresh = () => {
    firewall.refetch();
    fail2ban.refetch();
    ssh.refetch();
    ports.refetch();
    doctor.refetch();
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
      <Pressable
        style={styles.fallbackLink}
        onPress={() => pushIntoTab(router, '/(tabs)/deploy', '/(tabs)/deploy/terminal')}
      >
        <Text style={styles.fallbackLinkText}>Atau pakai Terminal Cepat (Exec) - gak butuh setup SSH</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Keamanan</Text>

      <Card>
        <Row
          label="Firewall"
          right={
            firewall.isLoading ? (
              <Text style={styles.mutedText}>Mengecek...</Text>
            ) : firewall.isError ? (
              <Text style={styles.errorTextSmall}>Gagal cek</Text>
            ) : firewall.data?.active ? (
              <StatusPill status="online" />
            ) : (
              <StatusPill status="stopped" />
            )
          }
        />
        <Text style={styles.subtext}>
          {!firewall.data?.detected
            ? 'Tidak terdeteksi (ufw/firewalld gak aktif).'
            : firewall.data.active
              ? `Aktif lewat ${firewall.data.tool}`
              : `Tidak aktif (${firewall.data.tool} terinstall tapi statusnya mati).`}
        </Text>
      </Card>

      <Card>
        <Row
          label="Fail2ban"
          right={
            fail2ban.isLoading ? (
              <Text style={styles.mutedText}>Mengecek...</Text>
            ) : fail2ban.isError ? (
              <Text style={styles.errorTextSmall}>Gagal cek</Text>
            ) : fail2ban.data?.installed ? (
              <StatusPill status="online" />
            ) : (
              <StatusPill status="stopped" />
            )
          }
        />
        <Text style={styles.subtext}>
          {fail2ban.data?.installed ? 'Terinstall & aktif.' : 'Belum terinstall / tidak aktif.'}
        </Text>
      </Card>

      <Card>
        <Text style={styles.rowLabel}>Konfigurasi SSH</Text>
        {ssh.isLoading && <Text style={styles.mutedText}>Mengecek...</Text>}
        {ssh.isError && <Text style={styles.errorTextSmall}>Gagal baca sshd_config.</Text>}
        {!ssh.isLoading && !ssh.isError && !ssh.data?.available && (
          <Text style={styles.subtext}>sshd_config tidak terbaca (butuh akses sudo, atau setting masih default).</Text>
        )}
        {ssh.data?.available && ssh.data.settings && (
          <View style={{ marginTop: spacing.xs }}>
            {Object.entries(ssh.data.settings).map(([key, value]) => (
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

      <Card>
        <Text style={styles.rowLabel}>
          Port Terbuka {ports.data ? `(${ports.data.ports.length})` : ''}
        </Text>
        {ports.isLoading && <Text style={styles.mutedText}>Mengecek...</Text>}
        {ports.isError && (
          <Text style={styles.errorTextSmall}>
            Gagal ambil daftar port: {(ports.error as Error)?.message ?? 'unknown error'}
          </Text>
        )}
        {ports.data?.ports.map((p, i) => (
          <View key={`${p.port}-${i}`} style={[styles.metricRow, i > 0 && styles.rowDivider]}>
            <Text style={styles.metricLabel}>:{p.port}</Text>
            <Text style={styles.metricValue} numberOfLines={1}>
              {p.process}
            </Text>
          </View>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>Sistem</Text>
      <Card>
        <Row
          label="Kesiapan Sistem"
          right={
            doctor.isLoading ? (
              <Text style={styles.mutedText}>Mengecek...</Text>
            ) : doctor.isError ? (
              <Text style={styles.errorTextSmall}>Gagal cek</Text>
            ) : doctor.data?.ok ? (
              <StatusPill status="online" />
            ) : (
              <StatusPill status="stopped" />
            )
          }
        />
        {doctor.data && (
          <Text style={styles.subtext}>
            deploy_user: {doctor.data.deployUser} · folder: {doctor.data.defaultFolder}
          </Text>
        )}
        {doctor.data?.ok && (
          <Text style={styles.subtext}>Sudoers, folder deploy, dan command eksternal semua siap.</Text>
        )}
        {doctor.data && !doctor.data.ok && (
          <View style={{ marginTop: spacing.sm }}>
            {doctor.data.issues.map((issue, i) => (
              <View key={`${issue.code}-${i}`} style={[styles.issueRow, i > 0 && styles.rowDivider]}>
                <Ionicons name="warning-outline" size={14} color={colors.amber} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.issueMessage}>{issue.message}</Text>
                  {issue.hint ? <Text style={styles.issueHint}>{issue.hint}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Scan Server</Text>
      <Card>
        <Text style={styles.subtext}>
          Cocokkan PM2, port, dan health-check API tiap project terhadap data registry - buat nemuin
          penyimpangan (app down tapi kecatat online, port asing, domain nginx salah arah, dll).
        </Text>
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="Scan Sekarang"
            variant="secondary"
            loading={scan.isFetching}
            onPress={() => scan.refetch()}
          />
        </View>
      </Card>

      {scan.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Scan gagal: {(scan.error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}

      {scan.data && (
        <>
          <Text style={styles.subsectionTitle}>Cocok Registry ({scan.data.registryMatches.length} project)</Text>
          {scan.data.registryMatches.length === 0 && (
            <Card><Text style={styles.mutedText}>Belum ada project terdaftar.</Text></Card>
          )}
          {scan.data.registryMatches.map((m) => (
            <Card key={m.name} style={styles.tightCard}>
              <Text style={styles.appName}>{m.name}</Text>
              <View style={styles.checkRow}>
                <CheckChip label="Folder" value={m.folderExists} />
                <CheckChip label="PM2" value={m.pm2Found} />
                <CheckChip label="Port" value={m.portMatch} />
                <CheckChip label="Domain" value={m.domainMatch} />
              </View>
            </Card>
          ))}

          {scan.data.api.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>Health-check API</Text>
              <Card>
                {scan.data.api.map((r, i) => (
                  <View key={`${r.name}-${i}`} style={[styles.metricRow, i > 0 && styles.rowDivider]}>
                    <Text style={styles.metricLabel}>{r.name}</Text>
                    <Text style={[styles.metricValue, !r.reachable && styles.warnValue]}>
                      {r.reachable ? `HTTP ${r.status}` : r.note ?? 'Tidak bisa dihubungi'}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {scan.data.orphanPm2Apps.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>App PM2 di Luar Registry</Text>
              <Card>
                <Text style={styles.subtext}>
                  App ini jalan di PM2 tapi gak tercatat di registry tool ini - kemungkinan di-deploy
                  manual atau app lama yang belum dibersihkan.
                </Text>
                {scan.data.orphanPm2Apps.map((a, i) => (
                  <View key={`${a.name}-${i}`} style={[styles.metricRow, styles.rowDivider]}>
                    <Text style={styles.metricLabel}>{a.name}</Text>
                    <Text style={styles.metricValue}>{a.owner} · :{a.port}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {scan.data.ports.orphanPorts.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>Port Asing</Text>
              <Card>
                <Text style={styles.subtext}>Port yang kebuka tapi gak nyambung ke project manapun di registry.</Text>
                {scan.data.ports.orphanPorts.map((p, i) => (
                  <View key={`${p.port}-${i}`} style={[styles.metricRow, styles.rowDivider]}>
                    <Text style={styles.metricLabel}>:{p.port}</Text>
                    <Text style={styles.metricValue} numberOfLines={1}>{p.label}</Text>
                  </View>
                ))}
              </Card>
            </>
          )}
        </>
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

function CheckChip({ label, value }: { label: string; value: boolean | null }) {
  const icon = value === null ? 'remove' : value ? 'checkmark' : 'close';
  const color = value === null ? colors.inkFaint : value ? colors.green : colors.red;
  const bg = value === null ? colors.divider : value ? colors.greenSoft : colors.redSoft;
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={11} color={color} />
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // AuroraBackground perlu induk yang punya ukuran pasti buat absoluteFill.
  wrap: { flex: 1 },
  // transparent - AuroraBackground dipasang di dalam `wrap` di atas.
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },
  fallbackLink: { paddingVertical: spacing.sm, alignItems: 'center' },
  fallbackLinkText: { fontSize: 12, color: colors.inkMuted, textDecorationLine: 'underline' },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  subsectionTitle: { fontSize: 12.5, fontWeight: '700', color: colors.inkMuted, marginTop: spacing.md, marginBottom: spacing.xs },
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
  issueRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 8 },
  issueMessage: { fontSize: 12.5, color: colors.ink, lineHeight: 17 },
  issueHint: { fontSize: 11.5, color: colors.inkMuted, marginTop: 2, lineHeight: 16 },
  tightCard: { paddingVertical: spacing.md, gap: spacing.xs },
  appName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  checkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  chipLabel: { fontSize: 10, fontWeight: '700' },
});
