import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, radius, spacing } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { isCompanionConfigured, isCoolifyConfigured } from '@/lib/storage';

/**
 * REDESIGN (5 Agustus 2026) - layar ini dulu isinya job-history vps-manager
 * (deploy_nextjs/ssl_issue/dst) + link Domain/Nginx/Backup/SSL-lama, SEMUA
 * manggil backend vps-manager yang sekarang MATI TOTAL (butuh sudo yang gak
 * bisa disetel programatik). Dirombak total, sisa CUMA fitur Coolify yang
 * beneran jalan. FAB "+" sekarang LANGSUNG ke Coolify (bukan lagi 2 tombol
 * terpisah: FAB mati + pill Coolify) - itu satu-satunya jalur deploy yang
 * masih fungsional.
 */
export default function DeployScreen() {
  const router = useRouter();
  const topPadding = useTabTopPadding();

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
  const refreshing = companionConfigured.isRefetching || coolifyConfigured.isRefetching;
  const onRefresh = () => {
    companionConfigured.refetch();
    coolifyConfigured.refetch();
  };

  return (
    <View style={styles.screen}>
      <AuroraBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Text style={styles.eyebrow}>ZENHUB VPS</Text>
        <Text style={styles.title}>Deploy</Text>

        {coolifyConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/deploy/coolify-domain')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>COOLIFY</Text>
                <Text style={styles.name}>Domain & SSL</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
        {coolifyConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/deploy/coolify-env')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>COOLIFY</Text>
                <Text style={styles.name}>Env Vars</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
        {companionConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/deploy/coolify-files')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>COOLIFY</Text>
                <Text style={styles.name}>File Viewer</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
        {companionConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/deploy/coolify-migrate')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>COOLIFY</Text>
                <Text style={styles.name}>DB Push / Seed</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
        {companionConfigured.data === true && coolifyConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/deploy/coolify-projects')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.type}>COOLIFY</Text>
                <Text style={styles.name}>Kelola Mapping Project</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}

        {companionConfigured.data !== true && coolifyConfigured.data !== true && (
          <Card>
            <Text style={styles.emptyText}>
              Belum ada koneksi Companion API/Coolify - isi dulu di Setelan biar fitur deploy muncul di sini.
            </Text>
          </Card>
        )}
      </ScrollView>

      {coolifyConfigured.data === true && (
        <View style={styles.fabRow}>
          <Fab onPress={() => router.push('/(tabs)/deploy/coolify-new')} size={54}>
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </Fab>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.sm },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  type: { fontSize: 10.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink, marginTop: 2 },
  coolifyLink: { borderColor: colors.greenSoft, backgroundColor: colors.greenSoft },
  fabRow: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
});
