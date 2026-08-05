import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { getContainerProcessEnv, listRegisteredProjects } from '@/lib/companionApi';
import { setCoolifyApplicationEnvsBulk } from '@/lib/coolifyApi';
import { ApiError } from '@/lib/api';

/**
 * REDESIGN (4 Agustus 2026): sebelumnya coba pake GET /applications/{uuid}/envs
 * buat lihat+edit - ternyata Coolify API itu SENGAJA gak pernah kirim field
 * "value" (keputusan keamanan mereka, dicek dari raw response nyata). Jadi
 * dipisah jelas jadi 2 hal beda:
 * - LIHAT: /proc/1/environ (value ASLI proses yang lagi jalan, via Companion API)
 * - SET: bulk update ke Coolify (nulis doang, gak bisa baca balik dari situ)
 */
export default function CoolifyEnvScreen() {
  const qc = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;

  const envQuery = useQuery({
    queryKey: ['process-env', selectedProject?.applicationUuid],
    queryFn: () => getContainerProcessEnv(selectedProject!.applicationUuid),
    enabled: Boolean(selectedProject),
  });

  const [setText, setSetText] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      const envs = setText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
        });
      return setCoolifyApplicationEnvsBulk(selectedProject.applicationUuid, envs);
    },
    onSuccess: () => {
      setSetText('');
      Alert.alert(
        'Tersimpan',
        'Env vars berhasil dikirim ke Coolify. INGAT: wajib Redeploy (bukan Restart) biar env baru kepakai, terus refresh tab "Lihat" ini buat konfirmasi.'
      );
    },
    onError: (err) => Alert.alert('Gagal Simpan', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
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
      {projects.length > 1 && (
        <Card>
          <Text style={styles.label}>Project</Text>
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
        </Card>
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Lihat (value asli, proses yang jalan)</Text>
        <Pressable onPress={() => envQuery.refetch()}>
          <Ionicons name="refresh" size={18} color={colors.accent} />
        </Pressable>
      </View>
      <Card>
        {envQuery.isLoading && <Text style={styles.mutedText}>Memuat...</Text>}
        {envQuery.isError && (
          <Text style={[styles.mutedText, { color: colors.red }]}>
            Gagal ambil env: {(envQuery.error as Error)?.message}
          </Text>
        )}
        {envQuery.data?.map((e) => (
          <View key={e.key} style={styles.envRow}>
            <Text style={styles.envKey} numberOfLines={1}>
              {e.key}
            </Text>
            <Text style={styles.envValue} numberOfLines={1}>
              {e.value || '(kosong)'}
            </Text>
          </View>
        ))}
      </Card>

      <Text style={styles.sectionTitle}>Set (kirim ke Coolify)</Text>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Format KEY=VALUE per baris. Ini NULIS doang - gak bisa dibaca balik dari sini (batasan API Coolify sendiri).
          Wajib Redeploy manual setelah kirim biar kepakai.
        </Text>
      </Card>
      <Card>
        <FormField
          label={`Env Vars Baru — ${selectedProject?.name ?? '-'}`}
          value={setText}
          onChangeText={setSetText}
          multiline
          numberOfLines={8}
          autoCapitalize="none"
          style={{ minHeight: 160, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }}
          placeholder={'DATABASE_URL=...\nJWT_SECRET=...'}
        />
        <Button label="Kirim ke Coolify" loading={saveMutation.isPending} onPress={() => saveMutation.mutate()} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  envRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.divider },
  envKey: { flex: 1, fontSize: 11.5, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
  envValue: { flex: 1.3, fontSize: 11.5, color: colors.inkMuted, fontFamily: 'monospace', textAlign: 'right' },
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
