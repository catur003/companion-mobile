import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { readContainerFile, listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

export default function CoolifyFileViewerScreen() {
  // Daftar project di-fetch dari Companion API (projects.json di VPS) - lihat
  // catatan di lib/companionApi.ts, bukan hardcode lagi.
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;

  const [path, setPath] = useState('package.json');
  const [content, setContent] = useState<string | null>(null);

  const readMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return readContainerFile(selectedProject.applicationUuid, path);
    },
    onSuccess: (res) => setContent(res.content),
    onError: (err) => {
      setContent(null);
      Alert.alert('Gagal Baca File', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
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

  if (projectsQuery.isError) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={[styles.mutedText, { color: colors.red }]}>
            Gagal ambil daftar project: {(projectsQuery.error as Error)?.message}
          </Text>
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
          Beta, read-only (belum ada tombol simpan di sini - endpoint write sudah dites bekerja, tapi UI edit belum
          dibuat, sengaja buat cek dulu isi source yang lagi jalan di VPS vs GitHub). Path relatif ke root app di
          container (/app).
        </Text>
      </Card>

      {projects.length > 1 && (
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
        <FormField
          label="Path File"
          value={path}
          onChangeText={setPath}
          autoCapitalize="none"
          placeholder="mis. package.json atau app/api/auth/login/route.js"
        />
        <Button label="Baca File" loading={readMutation.isPending} onPress={() => readMutation.mutate()} />
      </Card>

      {content !== null && (
        <Card>
          <Text style={styles.fileLabel}>{path}</Text>
          <ScrollView horizontal>
            <Text style={styles.code}>{content}</Text>
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
  fileLabel: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm },
  code: { fontFamily: 'monospace', fontSize: 11.5, color: colors.ink, lineHeight: 17 },
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
