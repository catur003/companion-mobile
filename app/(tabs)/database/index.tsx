import { View, Text, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Fab } from '@/components/Fab';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, spacing } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { listDatabases, testDatabaseConnection, ApiError } from '@/lib/api';
import { isCompanionConfigured, isCoolifyConfigured } from '@/lib/storage';

export default function DatabaseListScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['databases'],
    queryFn: listDatabases,
  });

  const companionConfigured = useQuery({
    queryKey: ['companion-configured'],
    queryFn: isCompanionConfigured,
    staleTime: 5000,
  });
  const coolifyConfigured = useQuery({
    queryKey: ['coolify-configured'],
    queryFn: isCoolifyConfigured,
    staleTime: 5000,
  });

  const testMutation = useMutation({
    mutationFn: testDatabaseConnection,
    onSuccess: () => Alert.alert('Berhasil', 'Koneksi ke MySQL (kredensial root dari Configuration) berhasil.'),
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const databases = data?.databases ?? [];

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <FlatList
        data={databases}
        keyExtractor={(item) => item}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            <Card>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>Koneksi MySQL</Text>
                  <Text style={styles.meta}>Tes kredensial root dari Configuration</Text>
                </View>
                <Button label="Test Koneksi" variant="secondary" loading={testMutation.isPending} onPress={() => testMutation.mutate()} />
              </View>
            </Card>
            {companionConfigured.data === true && (
              <Card onPress={() => router.push('/(tabs)/database/coolify-browse')} style={styles.coolifyLink}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>Browse Database Coolify (Beta)</Text>
                    <Text style={styles.meta}>List tabel & preview - gak perlu ngetik SQL</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                </View>
              </Card>
            )}
            {companionConfigured.data === true && (
              <Card onPress={() => router.push('/(tabs)/database/coolify-query')} style={styles.coolifyLink}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>Coolify SQL Query (Beta)</Text>
                    <Text style={styles.meta}>SELECT-only, raw hasil</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                </View>
              </Card>
            )}
            {coolifyConfigured.data === true && (
              <Card onPress={() => router.push('/(tabs)/database/coolify-new-database')} style={styles.coolifyLink}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>Buat Database Coolify (Beta)</Text>
                    <Text style={styles.meta}>MySQL - langsung ke Coolify, terpisah dari VPS lama</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                </View>
              </Card>
            )}
            <Text style={styles.sectionTitle}>{isLoading ? 'Memuat...' : `${databases.length} Database`}</Text>
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {isError ? `Gagal ambil daftar database: ${(error as Error)?.message}` : 'Belum ada database.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/database/${encodeURIComponent(item)}`)}>
            <View style={styles.row}>
              <View>
                <Text style={styles.name}>{item}</Text>
                <Text style={styles.meta}>Ketuk untuk lihat tabel & kelola</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
      />
      <View style={styles.fabWrap}>
        <Fab onPress={() => router.push('/(tabs)/database/create')}>
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </Fab>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // transparent - AuroraBackground dipasang sekali di (tabs)/_layout.tsx.
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg, paddingBottom: 100 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  coolifyLink: { borderColor: colors.blueSoft, backgroundColor: colors.blueSoft },
});
