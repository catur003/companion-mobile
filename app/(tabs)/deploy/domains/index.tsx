import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, radius, spacing } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { listDomains, DomainStatus } from '@/lib/api';

/**
 * Layar "Domain" - satu tempat buat liat status gabungan (nginx site / SSL /
 * project registry) per domain, tanpa perlu gonta-ganti 3 menu terpisah yang
 * masing-masing cuma tau sepotong cerita. Ini yang jawab keluhan "site nginx
 * hilang-muncul lagi" - sekarang langsung kelihatan KENAPA (mis. project
 * masih tercatat aktif di registry walau file nginx-nya udah gak ada).
 */
function Badge({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  const color = warn ? colors.amber : ok ? colors.green : colors.inkFaint;
  const bg = warn ? colors.amberSoft : ok ? colors.greenSoft : colors.divider;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function badgesFor(d: DomainStatus) {
  const badges = [
    <Badge key="nginx" ok={d.nginx.exists} label="Nginx" />,
    <Badge
      key="ssl"
      ok={d.ssl.exists}
      warn={d.ssl.exists && d.ssl.expiringSoon}
      label={d.ssl.exists ? (d.ssl.expiringSoon ? `SSL ${d.ssl.daysLeft}h` : 'SSL') : 'SSL'}
    />,
  ];
  if (d.project) {
    badges.push(<Badge key="project" ok={d.project.alive} label={d.project.alive ? 'Project aktif' : 'Project mati'} />);
  }
  return badges;
}

export default function DomainsScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['domains'],
    queryFn: listDomains,
  });

  const domains = data ?? [];

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <FlatList
        data={domains}
        keyExtractor={(d) => d.domain}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListHeaderComponent={
          <Text style={styles.intro}>
            Gabungan status nginx, SSL, dan project buat tiap domain yang dikenal sistem - biar gak perlu cek satu-satu
            lewat menu terpisah.
          </Text>
        }
        ListEmptyComponent={
          isLoading ? (
            <Card style={styles.loadingCard}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.emptyText}>Memuat daftar domain...</Text>
            </Card>
          ) : (
            <Card>
              <Text style={styles.emptyText}>
                {isError ? `Gagal ambil daftar domain: ${(error as Error)?.message}` : 'Belum ada domain terdaftar.'}
              </Text>
            </Card>
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/deploy/domains/${encodeURIComponent(item.domain)}`)}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.domain}>{item.domain}</Text>
                <View style={styles.badgeRow}>{badgesFor(item)}</View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg, paddingBottom: 40 },
  intro: { fontSize: 13, color: colors.inkMuted, lineHeight: 19, marginBottom: spacing.md },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  domain: { fontSize: 14.5, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 8, gap: 4 },
  badgeDot: { width: 5, height: 5, borderRadius: 2.5 },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
});
