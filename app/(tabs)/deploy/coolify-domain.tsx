import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { getCoolifyApplication, updateCoolifyApplicationDomain, listCoolifyServers, getServerIp } from '@/lib/coolifyApi';
import { listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

// Cuma huruf kecil, angka, dash - gak boleh diawali/diakhiri dash. Sesuai
// aturan label DNS standar (RFC 1035), biar gak generate domain invalid.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export default function CoolifyDomainScreen() {
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;

  const appQuery = useQuery({
    queryKey: ['coolify-app', selectedProject?.applicationUuid],
    queryFn: () => getCoolifyApplication(selectedProject!.applicationUuid),
    enabled: Boolean(selectedProject),
  });

  const [mode, setMode] = useState<'sslip' | 'custom'>('sslip');
  const [domain, setDomain] = useState('');

  // Template sslip.io - IP di-fetch LIVE dari Coolify API (bukan hardcode di
  // app), biar kalau pindah VPS/ganti IP form ini gak perlu update manual.
  const serversQuery = useQuery({ queryKey: ['coolify-servers'], queryFn: listCoolifyServers, staleTime: 60000 });
  const serverUuid = serversQuery.data?.[0]?.uuid; // auto-pick, sama pola kayak diagnostik.tsx
  const serverIpQuery = useQuery({
    queryKey: ['coolify-server-ip', serverUuid],
    queryFn: () => getServerIp(serverUuid!),
    enabled: Boolean(serverUuid),
    staleTime: 60000,
  });
  const [protocol, setProtocol] = useState<'http' | 'https'>('https');
  const [subdomain, setSubdomain] = useState('');
  const subdomainValid = subdomain.length > 0 && SUBDOMAIN_PATTERN.test(subdomain);
  const sslipFullDomain =
    serverIpQuery.data && subdomainValid ? `${protocol}://${subdomain}.${serverIpQuery.data}.sslip.io` : null;

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      if (mode === 'sslip') {
        if (!serverIpQuery.data) throw new ApiError('IP server belum kebaca, coba lagi.', 'NO_SERVER_IP');
        if (!subdomainValid) {
          throw new ApiError(
            'Nama subdomain cuma boleh huruf kecil, angka, dan dash (-), gak boleh diawali/diakhiri dash.',
            'INVALID_SUBDOMAIN'
          );
        }
        return updateCoolifyApplicationDomain(selectedProject.applicationUuid, sslipFullDomain!);
      }
      if (!domain.trim()) throw new ApiError('Isi domain dulu.', 'EMPTY_DOMAIN');
      return updateCoolifyApplicationDomain(selectedProject.applicationUuid, domain.trim());
    },
    onSuccess: () => {
      Alert.alert(
        'Domain Diupdate',
        'Coolify bakal otomatis urus SSL Let\'s Encrypt buat domain baru ini. Wajib Redeploy biar perubahan domain fully kepakai, dan pastiin DNS/port 80 udah kearah VPS ini.'
      );
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
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
          Beta. Pakai prefix "https://" biar SSL Let's Encrypt otomatis aktif (sama kayak yang dilakuin manual buat
          PORTOFOLIO). Port 80 VPS wajib kebuka buat verifikasi ACME.
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
        <Text style={styles.label}>Domain Sekarang</Text>
        <Text style={styles.currentDomain}>{appQuery.data?.fqdn ?? (appQuery.isLoading ? 'Memuat...' : '(belum ada)')}</Text>
      </Card>

      <Card>
        <Text style={styles.label}>Sumber Domain</Text>
        <View style={styles.chipRow}>
          <Pressable onPress={() => setMode('sslip')} style={[styles.chip, mode === 'sslip' && styles.chipActive]}>
            <Text style={[styles.chipText, mode === 'sslip' && styles.chipTextActive]}>Sslip.io (gratis, instan)</Text>
          </Pressable>
          <Pressable onPress={() => setMode('custom')} style={[styles.chip, mode === 'custom' && styles.chipActive]}>
            <Text style={[styles.chipText, mode === 'custom' && styles.chipTextActive]}>Domain Sendiri</Text>
          </Pressable>
        </View>
        {mode === 'sslip' ? (
          <Text style={styles.modeHint}>
            Gratis & langsung jalan tanpa setting DNS apapun, tapi domainnya gak profesional (isinya IP VPS). Cocok
            buat testing. IP di-ambil otomatis dari server Coolify kamu.
          </Text>
        ) : (
          <Text style={styles.modeHint}>
            WAJIB setting DNS A record dulu di provider domain kamu (Cloudflare/dst) SEBELUM isi form ini —
            arahkan subdomain ke IP VPS Coolify. Kalau DNS belum ngarah, SSL Let's Encrypt bakal gagal diterbitkan
            (domain aktif tapi https-nya invalid).
          </Text>
        )}
      </Card>

      {mode === 'sslip' ? (
        <Card>
          <Text style={styles.label}>Protokol</Text>
          <View style={styles.chipRow}>
            <Pressable onPress={() => setProtocol('https')} style={[styles.chip, protocol === 'https' && styles.chipActive]}>
              <Text style={[styles.chipText, protocol === 'https' && styles.chipTextActive]}>https</Text>
            </Pressable>
            <Pressable onPress={() => setProtocol('http')} style={[styles.chip, protocol === 'http' && styles.chipActive]}>
              <Text style={[styles.chipText, protocol === 'http' && styles.chipTextActive]}>http</Text>
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.md }}>
            <FormField
              label="Nama Domain"
              placeholder="myapp"
              keyboardType="default"
              autoCapitalize="none"
              value={subdomain}
              onChangeText={(v) => setSubdomain(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            />
          </View>
          {subdomain.length > 0 && !subdomainValid && (
            <Text style={styles.errorTextSmall}>Cuma huruf kecil, angka, dan dash — gak boleh diawali/diakhiri dash.</Text>
          )}

          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>Hasil akhir</Text>
            {serverIpQuery.isLoading && <Text style={styles.mutedText}>Mengambil IP server...</Text>}
            {serverIpQuery.isError && <Text style={styles.errorTextSmall}>Gagal ambil IP server dari Coolify.</Text>}
            {serverIpQuery.data && !subdomainValid && (
              <Text style={styles.previewPlaceholder}>{protocol}://&lt;nama-domain&gt;.{serverIpQuery.data}.sslip.io</Text>
            )}
            {sslipFullDomain && <Text style={styles.previewValue}>{sslipFullDomain}</Text>}
          </View>

          <Button label="Update Domain" loading={saveMutation.isPending} onPress={() => saveMutation.mutate()} />
        </Card>
      ) : (
        <Card>
          <FormField
            label="Domain Baru"
            placeholder="https://app.zenin.my.id  (ganti sesuai domainmu)"
            keyboardType="url"
            autoCapitalize="none"
            value={domain}
            onChangeText={setDomain}
          />
          <Button label="Update Domain" loading={saveMutation.isPending} onPress={() => saveMutation.mutate()} />
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
  modeHint: { fontSize: 11.5, color: colors.inkFaint, lineHeight: 16, marginTop: spacing.xs },
  currentDomain: { fontSize: 13, fontFamily: 'monospace', color: colors.ink },
  errorTextSmall: { fontSize: 11.5, color: colors.red, marginTop: spacing.xs },
  previewBox: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  previewLabel: { fontSize: 10, fontWeight: '700', color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  previewPlaceholder: { fontSize: 12.5, fontFamily: 'monospace', color: colors.inkFaint },
  previewValue: { fontSize: 12.5, fontFamily: 'monospace', color: colors.accent, fontWeight: '700' },
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
