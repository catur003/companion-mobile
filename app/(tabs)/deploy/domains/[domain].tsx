import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing } from '@/lib/theme';
import { getDomainStatus, ApiError } from '@/lib/api';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'muted' }) {
  const color = tone === 'ok' ? colors.green : tone === 'warn' ? colors.amber : tone === 'muted' ? colors.inkFaint : colors.ink;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, { color }]}>{value}</Text>
    </View>
  );
}

export default function DomainDetailScreen() {
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['domain', domain],
    queryFn: () => getDomainStatus(domain),
    enabled: !!domain,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error instanceof ApiError ? error.message : 'Gagal ambil status domain.'}</Text>
        <Button label="Coba Lagi" variant="secondary" onPress={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{data.domain}</Text>

      <Card>
        <Text style={styles.sectionLabel}>NGINX</Text>
        {data.nginx.exists ? (
          <>
            <Row label="Status" value="Site ada" tone="ok" />
            <Row label="Target" value={data.nginx.target ?? '-'} />
            <Button
              label="Lihat Site Nginx"
              variant="secondary"
              onPress={() => router.push(`/(tabs)/deploy/nginx/${encodeURIComponent(data.nginx.file!)}`)}
            />
          </>
        ) : (
          <>
            <Row label="Status" value="Gak ada file config" tone="muted" />
            <Button
              label="Buat Site Nginx"
              variant="secondary"
              onPress={() => router.push('/(tabs)/deploy/nginx/new')}
            />
          </>
        )}
      </Card>

      <Card>
        <Text style={styles.sectionLabel}>SSL</Text>
        {data.ssl.exists ? (
          <>
            <Row label="Status" value="Aktif" tone={data.ssl.expiringSoon ? 'warn' : 'ok'} />
            {data.ssl.daysLeft !== null && (
              <Row
                label="Sisa masa berlaku"
                value={`${data.ssl.daysLeft} hari${data.ssl.expiringSoon ? ' - segera perpanjang' : ''}`}
                tone={data.ssl.expiringSoon ? 'warn' : undefined}
              />
            )}
          </>
        ) : (
          <Row label="Status" value="Belum ada sertifikat" tone="muted" />
        )}
        <Button
          label={data.ssl.exists ? 'Perbarui SSL' : 'Terbitkan SSL'}
          variant="secondary"
          onPress={() => router.push({ pathname: '/(tabs)/deploy/ssl', params: { domain: data.domain } })}
        />
      </Card>

      <Card>
        <Text style={styles.sectionLabel}>PROJECT (REGISTRY)</Text>
        {data.project ? (
          <>
            <Row label="Nama" value={data.project.name} />
            <Row label="Status" value={data.project.alive ? 'Aktif' : 'Tidak aktif'} tone={data.project.alive ? 'ok' : 'warn'} />
            <Row label="Port" value={String(data.project.port)} />
            {!data.project.alive && (
              <Text style={styles.hint}>
                Project ini tercatat sudah tidak aktif (folder/PM2/nginx-nya sudah tidak ada semua). Domain akan otomatis
                terbebas begitu ada aksi yang memicu pengecekan ulang (mis. bikin site/project baru dengan domain ini).
              </Text>
            )}
            {data.project.alive && (
              <Text style={styles.hint}>
                Domain ini masih tercatat "dipakai" project di atas selama project-nya masih aktif - walaupun site
                nginx-nya dihapus manual, domain TETAP dianggap terpakai sampai project-nya sendiri dihapus.
              </Text>
            )}
          </>
        ) : (
          <Row label="Status" value="Tidak terkait project manapun" tone="muted" />
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: colors.bg },
  errorText: { fontSize: 13, color: colors.inkMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
  title: { fontSize: 19, fontWeight: '800', color: colors.ink },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { fontSize: 13, color: colors.inkMuted },
  infoValue: { fontSize: 13, fontWeight: '700' },
  hint: { fontSize: 12, color: colors.inkFaint, lineHeight: 17, marginTop: spacing.sm },
});
