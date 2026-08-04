import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius } from '@/lib/theme';
import { getCoolifyApplicationLogs, getCoolifyDeployment } from '@/lib/coolifyApi';
import { listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

/**
 * Coba beberapa kemungkinan nama field log dari response deployment mentah -
 * struktur exact-nya belum confirmed (lihat catatan di getCoolifyDeployment,
 * coolifyApi.ts). Fallback ke JSON.stringify kalau gak ketemu field yang
 * jelas isinya log text, biar tetep ada info yang ditampilin daripada kosong.
 */
function extractDeploymentLogText(data: Record<string, unknown>): string {
  const candidates = ['logs', 'output', 'log'];
  for (const key of candidates) {
    const val = data[key];
    if (typeof val === 'string' && val.length > 0) return val;
    if (Array.isArray(val)) return val.map((line) => String(line)).join('\n');
  }
  return JSON.stringify(data, null, 2);
}

export default function CoolifyLogsScreen() {
  // Kalau dibuka dari tombol "Log" di CoolifyAppCard, applicationUuid udah
  // dikirim lewat param - langsung fokus ke project itu tanpa perlu milih.
  // deploymentUuid CUMA ada kalau dibuka tepat setelah klik Start/Deploy di
  // session yang sama (lihat CoolifyAppCard.tsx) - belum ada riwayat deploy
  // lama yang bisa di-browse dari sini.
  const params = useLocalSearchParams<{ applicationUuid?: string; deploymentUuid?: string }>();

  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject =
    projects.find((p) => p.applicationUuid === params.applicationUuid) ??
    projects.find((p) => p.key === selectedKey) ??
    projects[0] ??
    null;

  const [activeTab, setActiveTab] = useState<'runtime' | 'build'>(params.deploymentUuid ? 'build' : 'runtime');
  const [logs, setLogs] = useState<string | null>(null);

  const loadRuntimeMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return getCoolifyApplicationLogs(selectedProject.applicationUuid, 300);
    },
    onSuccess: (res) => setLogs(res),
    onError: (err) => {
      setLogs(null);
      Alert.alert('Gagal Ambil Log', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  const loadBuildMutation = useMutation({
    mutationFn: () => {
      if (!params.deploymentUuid) throw new ApiError('Belum ada deployment yang bisa dilihat log-nya.', 'NO_DEPLOYMENT_UUID');
      return getCoolifyDeployment(params.deploymentUuid);
    },
    onSuccess: (res) => setLogs(extractDeploymentLogText(res)),
    onError: (err) => {
      setLogs(null);
      Alert.alert('Gagal Ambil Log Build', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  if (projectsQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Memuat daftar project...</Text>
        </Card>
      </View>
    );
  }

  if (projects.length === 0) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Belum ada project Coolify terdaftar.</Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta. "Runtime" - stdout/stderr app yang lagi jalan, historis bukan live-stream. "Build" - log proses
          install/build deployment terakhir, cuma tersedia kalau dibuka tepat setelah klik Start/Deploy (belum ada
          riwayat deploy lama yang bisa di-browse dari sini).
        </Text>
      </Card>

      <View style={styles.chipRow}>
        <Pressable onPress={() => setActiveTab('runtime')} style={[styles.chip, activeTab === 'runtime' && styles.chipActive]}>
          <Text style={[styles.chipText, activeTab === 'runtime' && styles.chipTextActive]}>Runtime</Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('build')}
          style={[styles.chip, activeTab === 'build' && styles.chipActive, !params.deploymentUuid && { opacity: 0.4 }]}
          disabled={!params.deploymentUuid}
        >
          <Text style={[styles.chipText, activeTab === 'build' && styles.chipTextActive]}>Build</Text>
        </Pressable>
      </View>

      {projects.length > 1 && !params.applicationUuid && activeTab === 'runtime' && (
        <View style={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setSelectedKey(p.key)}
              style={[styles.chip, (selectedKey ?? projects[0].key) === p.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, (selectedKey ?? projects[0].key) === p.key && styles.chipTextActive]}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Card>
        <Text style={styles.projectLabel}>
          {activeTab === 'runtime' ? selectedProject?.name ?? '-' : `Deployment: ${params.deploymentUuid?.slice(0, 12) ?? '-'}`}
        </Text>
        {activeTab === 'runtime' ? (
          <Button label="Ambil Log Terbaru" loading={loadRuntimeMutation.isPending} onPress={() => loadRuntimeMutation.mutate()} />
        ) : (
          <Button label="Ambil Log Build" loading={loadBuildMutation.isPending} onPress={() => loadBuildMutation.mutate()} />
        )}
      </Card>

      {logs !== null && (
        <Card>
          <ScrollView horizontal>
            <Text style={styles.code}>{logs || '(kosong)'}</Text>
          </ScrollView>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  projectLabel: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: spacing.sm },
  code: { fontFamily: 'monospace', fontSize: 11, color: colors.ink, lineHeight: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.card,
  },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  chipText: { fontSize: 12.5, fontWeight: '700', color: colors.inkMuted },
  chipTextActive: { color: colors.accent },
});
