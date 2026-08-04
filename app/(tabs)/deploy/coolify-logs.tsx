import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, radius } from '@/lib/theme';
import { getCoolifyApplicationLogs } from '@/lib/coolifyApi';
import { listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

export default function CoolifyLogsScreen() {
  // Kalau dibuka dari tombol "Log" di CoolifyAppCard, applicationUuid udah
  // dikirim lewat param - langsung fokus ke project itu tanpa perlu milih.
  const params = useLocalSearchParams<{ applicationUuid?: string }>();

  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject =
    projects.find((p) => p.applicationUuid === params.applicationUuid) ??
    projects.find((p) => p.key === selectedKey) ??
    projects[0] ??
    null;

  const [logs, setLogs] = useState<string | null>(null);

  const loadMutation = useMutation({
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
          Beta - log RUNTIME container (stdout/stderr app yang lagi jalan), historis bukan live-stream. Buat log
          proses BUILD (npm install/next build dst), cek tab Deployment di dashboard Coolify langsung.
        </Text>
      </Card>

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

      <Card>
        <Text style={styles.projectLabel}>{selectedProject?.name ?? '-'}</Text>
        <Button label="Ambil Log Terbaru" loading={loadMutation.isPending} onPress={() => loadMutation.mutate()} />
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
