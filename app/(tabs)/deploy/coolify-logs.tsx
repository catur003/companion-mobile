import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, FlatList } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius } from '@/lib/theme';
import {
  getCoolifyApplicationLogs,
  findActiveDeploymentForApp,
  getDeploymentDetail,
  DeploymentLogStep,
} from '@/lib/coolifyApi';
import { listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

const ACTIVE_STATUSES = ['in_progress', 'queued'];

/**
 * REDESIGN (5 Agustus 2026) - lihat REALTIME-DEPLOY-LOG.md buat riset
 * lengkapnya. Ganti total dari pendekatan lama ("cuma kebaca kalau baru
 * klik Start dari app itu sendiri, session-limited") jadi auto-detect:
 * cari deployment yang lagi aktif buat app ini lewat daftar umum
 * (findActiveDeploymentForApp), polling detailnya tiap 2 detik selama
 * status masih in_progress/queued, render INCREMENTAL (append doang, bukan
 * re-render semua tiap poll) pakai index posisi array (field "order" yang
 * diasumsikan draft awal TERNYATA GAK ADA di API beneran).
 */
export default function CoolifyLogsScreen() {
  const params = useLocalSearchParams<{ applicationUuid?: string }>();

  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject =
    projects.find((p) => p.applicationUuid === params.applicationUuid) ??
    projects.find((p) => p.key === selectedKey) ??
    projects[0] ??
    null;

  const [activeTab, setActiveTab] = useState<'runtime' | 'build'>('build');

  // ---- Runtime log (stdout/stderr app yang lagi jalan) - gak berubah dari sebelumnya ----
  const [runtimeLogs, setRuntimeLogs] = useState<string | null>(null);
  const loadRuntimeMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return getCoolifyApplicationLogs(selectedProject.applicationUuid, 300);
    },
    onSuccess: (res) => setRuntimeLogs(res),
    onError: (err) => {
      setRuntimeLogs(null);
      Alert.alert('Gagal Ambil Log', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  // ---- Build log (deploy yang lagi/baru aja jalan) - auto-detect ----
  // Cari deployment_uuid yang aktif buat app ini, sekali tiap kali app-nya
  // ganti (bukan di-polling - itu daftar umum, dipanggil sekali doang).
  const activeDeploymentQuery = useQuery({
    queryKey: ['active-deployment', selectedProject?.applicationUuid],
    queryFn: () => findActiveDeploymentForApp(selectedProject!.applicationUuid),
    enabled: Boolean(selectedProject) && activeTab === 'build',
    refetchInterval: (query) => (query.state.data ? false : 5000), // kalau belum ketemu, coba lagi tiap 5 detik (mungkin baru mulai deploy)
  });

  const deploymentUuid = activeDeploymentQuery.data?.deployment_uuid;

  // Ini yang di-POLLING (endpoint spesifik, ringan) - bukan activeDeploymentQuery di atas.
  const deploymentDetailQuery = useQuery({
    queryKey: ['deployment-detail', deploymentUuid],
    queryFn: () => getDeploymentDetail(deploymentUuid!),
    enabled: Boolean(deploymentUuid),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !ACTIVE_STATUSES.includes(status) ? false : 2000;
    },
  });

  // Render incremental - state lokal nyimpen step yang udah "ditampilin",
  // di-reset tiap kali pindah deploymentUuid (proyek beda / deploy baru).
  const [displayedSteps, setDisplayedSteps] = useState<DeploymentLogStep[]>([]);
  const lastIndexRef = useRef(0);

  useEffect(() => {
    setDisplayedSteps([]);
    lastIndexRef.current = 0;
  }, [deploymentUuid]);

  useEffect(() => {
    const allSteps = deploymentDetailQuery.data?.steps;
    if (!allSteps) return;
    if (allSteps.length > lastIndexRef.current) {
      const newSteps = allSteps.slice(lastIndexRef.current);
      lastIndexRef.current = allSteps.length;
      setDisplayedSteps((prev) => [...prev, ...newSteps]);
    }
  }, [deploymentDetailQuery.data]);

  const buildStatus = deploymentDetailQuery.data?.status ?? activeDeploymentQuery.data?.status;
  const isBuildActive = buildStatus ? ACTIVE_STATUSES.includes(buildStatus) : false;

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
    <View style={styles.screen}>
      <View style={styles.tabRow}>
        <Pressable onPress={() => setActiveTab('build')} style={[styles.tab, activeTab === 'build' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'build' && styles.tabTextActive]}>Build</Text>
        </Pressable>
        <Pressable onPress={() => setActiveTab('runtime')} style={[styles.tab, activeTab === 'runtime' && styles.tabActive]}>
          <Text style={[styles.tabText, activeTab === 'runtime' && styles.tabTextActive]}>Runtime</Text>
        </Pressable>
      </View>

      {projects.length > 1 && !params.applicationUuid && (
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

      {activeTab === 'build' ? (
        <>
          <View style={styles.statusBar}>
            {isBuildActive && <View style={styles.pulseDot} />}
            <Text style={styles.statusText}>
              {activeDeploymentQuery.isLoading
                ? 'Nyari deployment aktif...'
                : !deploymentUuid
                  ? 'Gak ada deploy yang lagi jalan buat project ini.'
                  : `Status: ${buildStatus} ${isBuildActive ? '(polling tiap 2 detik)' : ''}`}
            </Text>
          </View>

          <FlatList
            data={displayedSteps}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={styles.logContent}
            renderItem={({ item }) => (
              <Text style={[styles.logLine, item.type === 'stderr' && styles.logLineErr]}>
                {item.output}
              </Text>
            )}
            ListEmptyComponent={
              !activeDeploymentQuery.isLoading && !deploymentUuid ? (
                <Card style={{ margin: spacing.lg }}>
                  <Text style={styles.mutedText}>
                    Trigger Start/Deploy/Restart (dari app atau dashboard Coolify) buat lihat log build-nya di sini.
                  </Text>
                </Card>
              ) : null
            }
          />
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.introCard}>
            <Text style={styles.intro}>Stdout/stderr app yang lagi jalan, historis - bukan live-stream.</Text>
          </Card>
          <Card>
            <Text style={styles.projectLabel}>{selectedProject?.name ?? '-'}</Text>
            <Button label="Ambil Log Terbaru" loading={loadRuntimeMutation.isPending} onPress={() => loadRuntimeMutation.mutate()} />
          </Card>
          {runtimeLogs !== null && (
            <Card>
              <ScrollView horizontal>
                <Text style={styles.code}>{runtimeLogs || '(kosong)'}</Text>
              </ScrollView>
            </Card>
          )}
        </ScrollView>
      )}
    </View>
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
  tabRow: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.accent },
  tabText: { fontSize: 12.5, fontWeight: '700', color: colors.inkFaint },
  tabTextActive: { color: colors.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
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
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  statusText: { fontSize: 12, color: colors.inkMuted, fontWeight: '600' },
  logContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  logLine: { fontFamily: 'monospace', fontSize: 11, color: colors.ink, lineHeight: 16 },
  logLineErr: { color: colors.red },
});
