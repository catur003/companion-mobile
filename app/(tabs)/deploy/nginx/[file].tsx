import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius, mono } from '@/lib/theme';
import { viewNginxSite, deleteNginxSite, testNginxConfig, getDomainStatus, ApiError } from '@/lib/api';

export default function NginxSiteDetailScreen() {
  const { file } = useLocalSearchParams<{ file: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<{ valid: boolean; output: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [checkingBeforeDelete, setCheckingBeforeDelete] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['nginx-site', file],
    queryFn: () => viewNginxSite(file),
    enabled: Boolean(file),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteNginxSite(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nginx-sites'] });
      qc.invalidateQueries({ queryKey: ['domains'] });
      Alert.alert('Terhapus', `Site "${data?.domain ?? file}" berhasil dihapus.`, [{ text: 'OK', onPress: () => router.back() }]);
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  async function confirmDelete() {
    const domain = data?.domain ?? String(file);
    setCheckingBeforeDelete(true);
    let extraWarning = '';
    try {
      const status = await getDomainStatus(domain);
      if (status.project) {
        extraWarning = status.project.alive
          ? `\n\n⚠️ Domain ini masih terdaftar ke project "${status.project.name}" yang masih aktif. Menghapus site ini TIDAK menghapus project atau catatan domainnya - bikin site baru dengan domain yang sama akan tetap ditolak selama project ini masih ada.`
          : `\n\nDomain ini pernah terdaftar ke project "${status.project.name}", tapi project itu sudah tidak aktif.`;
      }
      if (status.ssl.exists) {
        extraWarning += '\n\nSertifikat SSL domain ini TIDAK ikut terhapus (tetap ada, terpisah dari site nginx).';
      }
    } catch {
      // Gagal ambil status tambahan bukan alasan buat blokir hapus - lanjut
      // tampilin dialog standar tanpa info ekstra.
    } finally {
      setCheckingBeforeDelete(false);
    }

    Alert.alert(
      `Hapus "${domain}"?`,
      `Domain ini akan langsung unreachable begitu site dihapus. Tindakan ini tidak bisa dibatalkan.${extraWarning}`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus Permanen', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  }

  async function handleTestConfig() {
    setTesting(true);
    try {
      const result = await testNginxConfig();
      setTestResult(result);
    } catch (err) {
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    } finally {
      setTesting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: data?.domain ?? String(file) }} />

      {isLoading && <Card><Text style={styles.mutedText}>Memuat...</Text></Card>}
      {isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal ambil detail site: {(error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <Row label="Domain" value={data.domain} />
            <Row label="Target" value={data.target} topGap />
            <Row label="File" value={data.file} topGap />
          </Card>

          <Text style={styles.sectionTitle}>Config Mentah</Text>
          <View style={styles.configBox}>
            <ScrollView horizontal>
              <Text style={styles.configText}>{data.content}</Text>
            </ScrollView>
          </View>

          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button label="Test Config Nginx" variant="secondary" loading={testing} onPress={handleTestConfig} />
            {testResult && (
              <Card style={{ borderColor: testResult.valid ? colors.greenSoft : colors.redSoft, backgroundColor: testResult.valid ? colors.greenSoft : colors.redSoft }}>
                <Text style={{ color: testResult.valid ? colors.green : colors.red, fontSize: 12.5, lineHeight: 18 }}>
                  {testResult.valid ? '✓ Config valid.' : testResult.output}
                </Text>
              </Card>
            )}
            <Button label="Hapus Site" variant="danger" loading={deleteMutation.isPending || checkingBeforeDelete} onPress={confirmDelete} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value, topGap }: { label: string; value: string; topGap?: boolean }) {
  return (
    <View style={[styles.row, topGap && { marginTop: spacing.sm }]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  rowLabel: { fontSize: 12, color: colors.inkMuted },
  rowValue: { fontSize: 12, fontWeight: '700', color: colors.ink, flexShrink: 1, textAlign: 'right' },
  configBox: {
    backgroundColor: colors.termBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.termBorder,
    padding: spacing.md,
  },
  configText: { fontFamily: mono.fontFamily, fontSize: 11.5, lineHeight: 17, color: colors.termText },
});
