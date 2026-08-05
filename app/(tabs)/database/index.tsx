import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Fab } from '@/components/Fab';
import { AuroraBackground } from '@/components/AuroraBackground';
import { colors, spacing } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { isCompanionConfigured, isCoolifyConfigured } from '@/lib/storage';

/**
 * REDESIGN (5 Agustus 2026) - KETAHUAN masih manggil listDatabases()/
 * testDatabaseConnection() vps-manager (KELEWAT pas cleanup Fase D/E - itu
 * yang bikin "database VPS lain masih kebaca", kredensial lama emang masih
 * nyangkut di SecureStore, gak pernah dihapus walau UI-nya udah dibuang).
 * Sekarang dirombak total, cuma sisa link Coolify/Companion. FAB "+"
 * sekarang langsung ke Buat Database Coolify (satu-satunya jalur create
 * yang masih fungsional - dulu ke /database/create, itu file udah dihapus).
 */
export default function DatabaseListScreen() {
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
    <View style={styles.wrap}>
      <AuroraBackground />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        <Text style={styles.eyebrow}>ZENHUB VPS</Text>
        <Text style={styles.title}>Database</Text>

        {coolifyConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/database/coolify-container-db')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>Kelola Container Database</Text>
                <Text style={styles.meta}>Tambah/hapus database di server yang udah ada</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
        {companionConfigured.data === true && (
          <Card onPress={() => router.push('/(tabs)/database/coolify-browse')} style={styles.coolifyLink}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>Browse Database</Text>
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
                <Text style={styles.name}>SQL Query</Text>
                <Text style={styles.meta}>SELECT-only, raw hasil</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}

        {companionConfigured.data !== true && coolifyConfigured.data !== true && (
          <Card>
            <Text style={styles.emptyText}>
              Belum ada koneksi Companion API/Coolify - isi dulu di Setelan biar fitur database muncul di sini.
            </Text>
          </Card>
        )}
      </ScrollView>

      {coolifyConfigured.data === true && (
        <View style={styles.fabWrap}>
          <Fab onPress={() => router.push('/(tabs)/database/coolify-new-database')}>
            <Ionicons name="add" size={26} color={colors.onAccent} />
          </Fab>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.sm },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.sm },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkFaint, marginTop: 2 },
  fabWrap: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  coolifyLink: { borderColor: colors.blueSoft, backgroundColor: colors.blueSoft },
});
