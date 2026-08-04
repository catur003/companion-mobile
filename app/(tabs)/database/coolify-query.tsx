import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { runCompanionDbQuery, DbQueryResult } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

// TEMPORARY (Fase 4, baru PORTOFOLIO): databaseUuid MySQL PORTOFOLIO
// di-hardcode - sama alasannya kayak PORTOFOLIO_CONTAINER_ID di Dashboard,
// belum ada pemetaan project -> resource Coolify yang bisa ditebak otomatis.
const PORTOFOLIO_DB_UUID = 'w9j9c3qkkpfg9r3tco4st5f8';

export default function CoolifyQueryScreen() {
  const [sql, setSql] = useState('SELECT * FROM admins LIMIT 20');
  const [result, setResult] = useState<DbQueryResult | null>(null);

  const runMutation = useMutation({
    mutationFn: () => runCompanionDbQuery(PORTOFOLIO_DB_UUID, sql),
    onSuccess: (res) => setResult(res),
    onError: (err) => {
      setResult(null);
      Alert.alert('Query Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta. Cuma SELECT (termasuk WITH/CTE) yang diizinkan - endpoint ini menolak query mutasi. Target: database
          MySQL PORTOFOLIO di Coolify.
        </Text>
      </Card>

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
});
