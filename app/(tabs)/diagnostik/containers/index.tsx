import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { StatusPill } from '@/components/StatusPill';
import { colors, spacing } from '@/lib/theme';
import { listDiagnosticContainers } from '@/lib/companionApi';

/**
 * docker ps -- SEMUA container di host, termasuk infra Coolify sendiri
 * (coolify-db, coolify-proxy, dst). Sengaja gak difilter cuma-app-milik-user
 * -- ini tab diagnostik VPS umum, bukan scoped per-project (beda dari
 * Dashboard yang emang cuma nampilin app yang terdaftar).
 */
export default function DiagnosticContainersScreen() {
  const router = useRouter();

  const query = useQuery({
    queryKey: ['diagnostic-containers'],
    queryFn: listDiagnosticContainers,
    refetchInterval: 15000, // ringan, cuma docker ps - aman di-poll
  });

  const containers = query.data ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.accent} />}
    >
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Read-only -- cuma nampilin info, gak ada start/stop/exec dari sini. Env var sensitif (password/token/dst)
          udah di-mask dari server.
        </Text>
      </Card>

      {query.isLoading && (
        <Card>
          <Text style={styles.mutedText}>Memuat daftar container...</Text>
        </Card>
      )}

      {query.isError && (
        <Card>
          <Text style={styles.errorText}>Gagal ambil daftar container. Tarik ke bawah buat coba lagi.</Text>
        </Card>
      )}

      {containers.map((c) => (
        <Card key={c.fullId} onPress={() => router.push(`/(tabs)/diagnostik/containers/${c.id}`)}>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
            <StatusPill status={c.state} />
          </View>
          <Text style={styles.image} numberOfLines={1}>{c.image}</Text>
          <Text style={styles.status}>{c.status}</Text>
          {c.ports.length > 0 && (
            <Text style={styles.ports} numberOfLines={1}>
              {c.ports.map((p) => `${p.public ?? '-'}→${p.private}/${p.type}`).join('  ')}
            </Text>
          )}
        </Card>
      ))}

      {!query.isLoading && containers.length === 0 && !query.isError && (
        <Card>
          <Text style={styles.mutedText}>Gak ada container ditemukan.</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  errorText: { fontSize: 13, color: colors.red, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink, flexShrink: 1, marginRight: spacing.sm },
  image: { fontSize: 11.5, fontFamily: 'monospace', color: colors.inkMuted },
  status: { fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
  ports: { fontSize: 11, fontFamily: 'monospace', color: colors.inkFaint, marginTop: 4 },
});
