import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/lib/theme';
import { describeTable, countRows, previewTable } from '@/lib/api';

type TabKey = 'describe' | 'count' | 'preview';

export default function TableDetailScreen() {
  const { dbName, tableName } = useLocalSearchParams<{ dbName: string; tableName: string }>();
  const [tab, setTab] = useState<TabKey>('describe');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: tableName }} />
      <View style={styles.tabBar}>
        <TabButton label="Struktur" active={tab === 'describe'} onPress={() => setTab('describe')} />
        <TabButton label="Jumlah Baris" active={tab === 'count'} onPress={() => setTab('count')} />
        <TabButton label="Preview" active={tab === 'preview'} onPress={() => setTab('preview')} />
      </View>
      {tab === 'describe' && <DescribeTab dbName={dbName} tableName={tableName} />}
      {tab === 'count' && <CountTab dbName={dbName} tableName={tableName} />}
      {tab === 'preview' && <PreviewTab dbName={dbName} tableName={tableName} />}
    </View>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tabBtn, active && styles.tabBtnActive]} onPress={onPress}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function DescribeTab({ dbName, tableName }: { dbName: string; tableName: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['describe', dbName, tableName],
    queryFn: () => describeTable(dbName, tableName),
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {isLoading && <Text style={styles.muted}>Memuat struktur tabel...</Text>}
      {isError && <Text style={styles.errText}>{(error as Error)?.message}</Text>}
      {data?.columns.map((col) => (
        <Card key={col.field}>
          <View style={styles.colHeader}>
            <Text style={styles.colName}>{col.field}</Text>
            {col.key === 'PRI' && <Text style={styles.pkBadge}>PRIMARY</Text>}
          </View>
          <Text style={styles.colType}>{col.type}</Text>
          <View style={styles.colMetaRow}>
            <Text style={styles.colMeta}>Null: {col.nullable}</Text>
            <Text style={styles.colMeta}>Default: {col.default || '—'}</Text>
          </View>
          {col.extra ? <Text style={styles.colMeta}>{col.extra}</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}

function CountTab({ dbName, tableName }: { dbName: string; tableName: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['count', dbName, tableName],
    queryFn: () => countRows(dbName, tableName),
  });

  return (
    <View style={[styles.content, { alignItems: 'center', paddingTop: 60 }]}>
      {isLoading && <Text style={styles.muted}>Menghitung baris...</Text>}
      {isError && <Text style={styles.errText}>{(error as Error)?.message}</Text>}
      {data && (
        <>
          <Text style={styles.bigNumber}>{data.total.toLocaleString('id-ID')}</Text>
          <Text style={styles.muted}>total baris di tabel ini</Text>
        </>
      )}
    </View>
  );
}

function PreviewTab({ dbName, tableName }: { dbName: string; tableName: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['preview', dbName, tableName],
    queryFn: () => previewTable(dbName, tableName),
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {isLoading && <Text style={styles.muted}>Memuat preview...</Text>}
      {isError && <Text style={styles.errText}>{(error as Error)?.message}</Text>}
      {data?.rows.length === 0 && <Text style={styles.muted}>Tabel ini kosong.</Text>}
      {data?.rows.map((row, i) => (
        <Card key={i}>
          <Text style={styles.rowLabel}>Baris {i + 1}</Text>
          {row.map((field) => (
            <View key={field.key} style={styles.fieldRow}>
              <Text style={styles.fieldKey}>{field.key}</Text>
              <Text style={styles.fieldValue}>{field.value || '—'}</Text>
            </View>
          ))}
        </Card>
      ))}
      {data && data.rows.length > 0 && (
        <Text style={styles.muted}>Menampilkan maksimal 10 baris pertama.</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  tabBar: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: colors.accent },
  tabLabel: { fontSize: 12.5, fontWeight: '700', color: colors.inkFaint },
  tabLabelActive: { color: colors.accent },
  muted: { fontSize: 13, color: colors.inkMuted, textAlign: 'center' },
  errText: { fontSize: 13, color: colors.red },
  colHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  pkBadge: { fontSize: 9, fontWeight: '800', color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  colType: { fontSize: 12, color: colors.inkMuted, marginTop: 2, fontFamily: 'monospace' },
  colMetaRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  colMeta: { fontSize: 11, color: colors.inkFaint },
  bigNumber: { fontSize: 40, fontWeight: '800', color: colors.accent },
  rowLabel: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, marginBottom: 8, textTransform: 'uppercase' },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.divider },
  fieldKey: { fontSize: 11.5, color: colors.inkMuted, flex: 1 },
  fieldValue: { fontSize: 11.5, color: colors.ink, flex: 1.5, textAlign: 'right', fontFamily: 'monospace' },
});
