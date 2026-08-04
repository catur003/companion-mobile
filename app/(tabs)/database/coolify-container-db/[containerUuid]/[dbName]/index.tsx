import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/lib/theme';
import { runCompanionDbQuery } from '@/lib/companionApi';

export default function ContainerDbTablesScreen() {
  const { containerUuid, dbName } = useLocalSearchParams<{ containerUuid: string; dbName: string }>();
  const router = useRouter();

  const tablesQuery = useQuery({
    queryKey: ['container-db-tables', containerUuid, dbName],
    queryFn: async () => {
      const res = await runCompanionDbQuery(
        containerUuid,
        'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
        dbName
      );
      return res.rows.map((r) => String(r.name));
    },
  });

  const tables = tablesQuery.data ?? [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: dbName }} />
      <FlatList
        data={tables}
        keyExtractor={(t) => t}
        contentContainerStyle={styles.content}
        onRefresh={tablesQuery.refetch}
        refreshing={tablesQuery.isRefetching}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>{tablesQuery.isLoading ? 'Memuat tabel...' : `${tables.length} Tabel`}</Text>
        }
        ListEmptyComponent={
          !tablesQuery.isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {tablesQuery.isError ? `Gagal ambil daftar tabel: ${(tablesQuery.error as Error)?.message}` : 'Database ini kosong, belum ada tabel.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            onPress={() =>
              router.push(
                `/(tabs)/database/coolify-container-db/${encodeURIComponent(containerUuid)}/${encodeURIComponent(dbName)}/${encodeURIComponent(item)}`
              )
            }
          >
            <View style={styles.row}>
              <Text style={styles.name}>{item}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, marginTop: spacing.md, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
});
