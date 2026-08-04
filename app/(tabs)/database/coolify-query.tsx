import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { runCompanionDbQuery, DbQueryResult } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';
import { coolifyProjectsWithDatabase } from '@/lib/coolifyProjects';

export default function CoolifyQueryScreen() {
  const projects = coolifyProjectsWithDatabase();
  const [selectedKey, setSelectedKey] = useState(projects[0]?.key);
  const selectedProject = projects.find((p) => p.key === selectedKey) ?? null;

  const [sql, setSql] = useState('SELECT * FROM admins LIMIT 20');
  const [result, setResult] = useState<DbQueryResult | null>(null);

  const runMutation = useMutation({
    mutationFn: () => {
      if (!selectedProject) throw new ApiError('Pilih project dulu.', 'NO_PROJECT_SELECTED');
      return runCompanionDbQuery(selectedProject.databaseUuid!, sql);
    },
    onSuccess: (res) => setResult(res),
    onError: (err) => {
      setResult(null);
      Alert.alert('Query Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  if (projects.length === 0) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Belum ada project Coolify dengan database terdaftar.</Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta. Cuma SELECT (termasuk WITH/CTE) yang diizinkan - endpoint ini menolak query mutasi.
        </Text>
      </Card>

      {projects.length > 1 && (
        <View style={styles.chipRow}>
          {projects.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => setSelectedKey(p.key)}
              style={[styles.chip, selectedKey === p.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, selectedKey === p.key && styles.chipTextActive]}>{p.name}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Card>
        <FormField
          label="Query SQL"
          value={sql}
          onChangeText={setSql}
          multiline
          numberOfLines={4}
          style={{ minHeight: 90, textAlignVertical: 'top', fontFamily: 'monospace', fontSize: 12.5 }}
          placeholder="SELECT * FROM nama_tabel LIMIT 20"
        />
        <Button label="Jalankan Query" loading={runMutation.isPending} onPress={() => runMutation.mutate()} />
      </Card>

      {result && (
        <Card>
          <Text style={styles.resultMeta}>
            {result.rowCount} baris{result.truncated ? ' (dipotong, tampil sebagian)' : ''}
          </Text>
          {result.rows.length === 0 ? (
            <Text style={styles.mutedText}>Query sukses, tapi hasilnya kosong.</Text>
          ) : (
            <ScrollView horizontal>
              <View>
                <View style={styles.rowHeader}>
                  {result.columns.map((col) => (
                    <Text key={col} style={styles.cellHeader}>
                      {col}
                    </Text>
                  ))}
                </View>
                {result.rows.map((row, i) => (
                  <View key={i} style={styles.rowData}>
                    {result.columns.map((col) => (
                      <Text key={col} style={styles.cell}>
                        {String(row[col] ?? '—')}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
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
  resultMeta: { fontSize: 11.5, color: colors.inkFaint, marginBottom: spacing.sm, fontWeight: '600' },
  rowHeader: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.divider, paddingBottom: 6, marginBottom: 4 },
  rowData: { flexDirection: 'row', paddingVertical: 4 },
  cellHeader: { width: 130, fontSize: 11, fontWeight: '700', color: colors.ink, paddingRight: spacing.sm },
  cell: { width: 130, fontSize: 12, color: colors.inkMuted, paddingRight: spacing.sm },
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
