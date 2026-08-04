import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/lib/theme';
import { listRegisteredProjects } from '@/lib/companionApi';
import { coolifyProjectsWithDatabase } from '@/lib/coolifyProjects';

export default function CoolifyBrowseProjectsScreen() {
  const router = useRouter();
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = coolifyProjectsWithDatabase(projectsQuery.data ?? []);

  return (
    <View style={styles.screen}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>
            {projectsQuery.isLoading ? 'Memuat...' : `${projects.length} Database (Coolify)`}
          </Text>
        }
        ListEmptyComponent={
          !projectsQuery.isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {projectsQuery.isError
                  ? `Gagal ambil daftar project: ${(projectsQuery.error as Error)?.message}`
                  : 'Belum ada project Coolify dengan database terdaftar.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/database/coolify-browse/${encodeURIComponent(item.key)}`)}>
            <View style={styles.row}>
              <View>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>Ketuk untuk lihat tabel</Text>
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
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
});
