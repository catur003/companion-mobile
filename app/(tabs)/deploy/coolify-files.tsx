import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable, FlatList } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { colors, spacing, radius } from '@/lib/theme';
import { readContainerFile, listContainerDirectory, listRegisteredProjects, DirectoryEntry } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

/**
 * File EXPLORER (bukan input path manual lagi, 4 Agustus 2026) - list isi
 * folder dulu, tap folder buat masuk, tap file buat baca isinya. User gak
 * perlu tau/ngetik nama file duluan.
 */
export default function CoolifyFileViewerScreen() {
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;

  const [currentPath, setCurrentPath] = useState('.');
  const [fileContent, setFileContent] = useState<{ path: string; content: string } | null>(null);

  const listQuery = useQuery({
    queryKey: ['coolify-file-list', selectedProject?.applicationUuid, currentPath],
    queryFn: () => listContainerDirectory(selectedProject!.applicationUuid, currentPath),
    enabled: Boolean(selectedProject),
  });

  const readMutation = useMutation({
    mutationFn: (path: string) => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return readContainerFile(selectedProject.applicationUuid, path);
    },
    onError: (err) => {
      Alert.alert('Gagal Baca File', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  function openEntry(entry: DirectoryEntry) {
    const nextPath = currentPath === '.' ? entry.name : `${currentPath}/${entry.name}`;
    if (entry.isDirectory) {
      setCurrentPath(nextPath);
      setFileContent(null);
    } else {
      readMutation.mutate(nextPath, {
        onSuccess: (res) => setFileContent({ path: nextPath, content: res.content }),
      });
    }
  }

  function goUp() {
    if (currentPath === '.') return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.length === 0 ? '.' : parts.join('/'));
    setFileContent(null);
  }

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

  const entries = listQuery.data?.entries ?? [];
  // Folder dulu, baru file, masing-masing diurutkan alfabetis - biar navigasi predictable.
  const sorted = [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <View style={styles.screen}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta, read-only (endpoint write udah dites bekerja, UI edit belum dibuat). Tap folder buat masuk, tap file
          buat baca isinya.
        </Text>
      </Card>

      {projects.length > 1 && (
        <Card>
          <Text style={styles.label}>Project</Text>
          <View style={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => {
                setSelectedKey(p.key);
                setCurrentPath('.');
                setFileContent(null);
              }}
              style={[styles.chip, (selectedKey ?? projects[0].key) === p.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, (selectedKey ?? projects[0].key) === p.key && styles.chipTextActive]}>
                {p.name}
              </Text>
            </Pressable>
          ))}
          </View>
        </Card>
      )}

      <View style={styles.pathRow}>
        <Pressable onPress={goUp} disabled={currentPath === '.'} style={{ opacity: currentPath === '.' ? 0.3 : 1 }}>
          <Ionicons name="arrow-up-circle-outline" size={22} color={colors.accent} />
        </Pressable>
        <Text style={styles.pathText} numberOfLines={1}>
          /app{currentPath === '.' ? '' : '/' + currentPath}
        </Text>
      </View>

      {fileContent ? (
        <Card style={{ flex: 1 }}>
          <View style={styles.fileHeaderRow}>
            <Text style={styles.fileLabel} numberOfLines={1}>
              {fileContent.path}
            </Text>
            <Pressable onPress={() => setFileContent(null)}>
              <Ionicons name="close-circle-outline" size={20} color={colors.inkFaint} />
            </Pressable>
          </View>
          <ScrollView>
            <ScrollView horizontal>
              <Text style={styles.code}>{fileContent.content}</Text>
            </ScrollView>
          </ScrollView>
        </Card>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(e) => e.name}
          contentContainerStyle={styles.listContent}
          onRefresh={listQuery.refetch}
          refreshing={listQuery.isRefetching}
          ListEmptyComponent={
            !listQuery.isLoading ? (
              <Card>
                <Text style={styles.mutedText}>
                  {listQuery.isError ? `Gagal ambil isi folder: ${(listQuery.error as Error)?.message}` : 'Folder ini kosong.'}
                </Text>
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <Card onPress={() => openEntry(item)} style={styles.entryCard}>
              <View style={styles.entryRow}>
                <Ionicons
                  name={item.isDirectory ? 'folder-outline' : 'document-text-outline'}
                  size={18}
                  color={item.isDirectory ? colors.accent : colors.inkMuted}
                />
                <Text style={styles.entryName} numberOfLines={1}>
                  {item.name}
                </Text>
                {readMutation.isPending && <Text style={styles.mutedText}>...</Text>}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.sm },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
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
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pathText: { flex: 1, fontFamily: 'monospace', fontSize: 12, color: colors.inkMuted },
  listContent: { gap: spacing.xs, paddingBottom: spacing.xxl },
  entryCard: { paddingVertical: spacing.sm },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  entryName: { flex: 1, fontSize: 13.5, color: colors.ink },
  fileHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  fileLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.inkFaint },
  code: { fontFamily: 'monospace', fontSize: 11.5, color: colors.ink, lineHeight: 17 },
});
