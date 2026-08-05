import { View, Text, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { colors, spacing } from '@/lib/theme';
import { listNginxSites, testNginxConfig, reloadNginx, ApiError } from '@/lib/api';

export default function NginxSitesScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['nginx-sites'],
    queryFn: listNginxSites,
  });

  const testMutation = useMutation({
    mutationFn: testNginxConfig,
    onSuccess: (res) => {
      Alert.alert(
        res.valid ? 'Config Valid' : 'Config Bermasalah',
        res.output || (res.valid ? 'nginx -t sukses tanpa output.' : 'Ada error, cek detail di server.')
      );
    },
    onError: (err) => Alert.alert('Gagal Test Config', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const reloadMutation = useMutation({
    mutationFn: reloadNginx,
    onSuccess: () => Alert.alert('Berhasil', 'Nginx sudah di-reload.'),
    onError: (err) => Alert.alert('Gagal Reload', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const sites = data?.sites ?? [];

  return (
    <View style={styles.screen}>
      <FlatList
        data={sites}
        keyExtractor={(item) => item.file}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            <Card>
              <View style={styles.actionsRow}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Test Config"
                    variant="secondary"
                    loading={testMutation.isPending}
                    onPress={() => testMutation.mutate()}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Reload Nginx" loading={reloadMutation.isPending} onPress={() => reloadMutation.mutate()} />
                </View>
              </View>
            </Card>
            <Text style={styles.sectionTitle}>{isLoading ? 'Memuat...' : `${sites.length} Site`}</Text>
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {isError ? `Gagal ambil daftar site: ${(error as Error)?.message}` : 'Belum ada site nginx.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/deploy/nginx/${encodeURIComponent(item.file)}`)}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.domain}>{item.domain}</Text>
                <Text style={styles.target} numberOfLines={1}>{item.target}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
      />
      <View style={styles.fabWrap}>
        <Fab onPress={() => router.push('/(tabs)/deploy/nginx/new')}>
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </Fab>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  domain: { fontSize: 15, fontWeight: '700', color: colors.ink },
  target: { fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
});
