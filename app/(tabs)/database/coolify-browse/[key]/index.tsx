import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/lib/theme';
import { runCompanionDbQuery, listRegisteredProjects } from '@/lib/companionApi';

export default function CoolifyBrowseTablesScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();

  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const project = (projectsQuery.data ?? []).find((p) => p.key === key);

  const tablesQuery = useQuery({
    queryKey: ['coolify-browse-tables', project?.databaseUuid],
    queryFn: async () => {
      const res = await runCompanionDbQuery(
        project!.databaseUuid!,
        'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name'
      );
      return res.rows.map((r) => String(r.name));
    },
    enabled: Boolean(project?.databaseUuid),
  });

  const tables = tablesQuery.data ?? [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: project?.name ?? 'Database' }} />
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
                {tablesQuery.isError ? `Gagal ambil daftar tabel: ${(tablesQuery.error as Error)?.message}` : 'Belum ada tabel.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/database/coolify-browse/${encodeURIComponent(key)}/${encodeURIComponent(item)}`)}>
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
