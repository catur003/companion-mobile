import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { getCoolifyApplicationEnvs, setCoolifyApplicationEnvsBulk } from '@/lib/coolifyApi';
import { listRegisteredProjects } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

/**
 * FIX (4 Agustus 2026): asumsi field "key"/"value" polos dari GET /envs
 * TERBUKTI SALAH (muncul "undefined" di semua value pas dites nyata) -
 * dokumentasi Coolify gak kasih schema detail buat endpoint ini. Sekarang
 * coba beberapa kemungkinan nama field yang umum dipakai Laravel API
 * (termasuk kemungkinan "real_value" - Coolify encode value env lewat
 * kolom terpisah buat yang di-mark shared/preview di beberapa versi).
 */
function pickEnvKey(e: Record<string, unknown>): string {
  return String(e.key ?? e.name ?? e.env_key ?? '');
}
function pickEnvValue(e: Record<string, unknown>): string {
  const val = e.value ?? e.real_value ?? e.env_value ?? e.val;
  return val != null ? String(val) : '';
}

function envsToText(envs: Record<string, unknown>[]): string {
  const lines = envs.map((e) => `${pickEnvKey(e)}=${pickEnvValue(e)}`);
  const allEmpty = envs.length > 0 && envs.every((e) => !pickEnvValue(e));
  if (allEmpty) {
    // Masih salah tebak field-nya lagi - daripada nampilin semua kosong diam-diam,
    // kasih tau + lampirin raw response biar ketauan field aslinya apa buat next fix.
    return `# PERINGATAN: gagal parse value env vars (field response beda dari dugaan)\n# Raw response buat debug:\n# ${JSON.stringify(envs)}\n\n${lines.join('\n')}`;
  }
  return lines.join('\n');
}

function textToEnvs(text: string): { key: string; value: string }[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const idx = line.indexOf('=');
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    });
}

export default function CoolifyEnvScreen() {
  const qc = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const projects = projectsQuery.data ?? [];

  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? projects[0] ?? null;

  const envsQuery = useQuery({
    queryKey: ['coolify-envs', selectedProject?.applicationUuid],
    queryFn: () => getCoolifyApplicationEnvs(selectedProject!.applicationUuid),
    enabled: Boolean(selectedProject),
  });

  const [text, setText] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (envsQuery.data && !dirty) {
      setText(envsToText(envsQuery.data));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envsQuery.data]);

  useEffect(() => {
    // Ganti project -> reset dirty state & text, biar gak nyampur env project lain.
    setDirty(false);
    setText('');
  }, [selectedProject?.key]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return setCoolifyApplicationEnvsBulk(selectedProject.applicationUuid, textToEnvs(text));
    },
    onSuccess: () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['coolify-envs', selectedProject?.applicationUuid] });
      Alert.alert(
        'Tersimpan',
        'Env vars berhasil diupdate. INGAT: wajib Redeploy (bukan Restart) biar env baru kepakai - lihat catatan di atas.'
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
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta. Format KEY=VALUE per baris (bukan format .env dengan quote). Ganti env TIDAK otomatis kepakai -
          wajib Redeploy manual setelah simpan (lihat card "Coolify" di Dashboard, tombol Start/Deploy).
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
        {envsQuery.isLoading && <Text style={styles.mutedText}>Memuat env vars...</Text>}
        {envsQuery.isError && (
          <Text style={[styles.mutedText, { color: colors.red }]}>
            Gagal ambil env vars: {(envsQuery.error as Error)?.message}
          </Text>
        )}
        {!envsQuery.isLoading && (
          <FormField
            label={`Env Vars — ${selectedProject?.name ?? '-'}`}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setDirty(true);
            }}
            multiline
            numberOfLines={12}
            style={{ minHeight: 240, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12 }}
            placeholder={'DATABASE_URL=...\nNEXTAUTH_SECRET=...'}
          />
        )}
        <Button label="Simpan Env Vars" loading={saveMutation.isPending} disabled={!dirty} onPress={() => saveMutation.mutate()} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
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
