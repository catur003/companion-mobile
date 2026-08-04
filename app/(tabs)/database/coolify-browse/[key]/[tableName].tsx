import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/lib/theme';
import { runCompanionDbQuery, listRegisteredProjects } from '@/lib/companionApi';

type TabKey = 'describe' | 'count' | 'preview';

/** Bungkus nama identifier (table name) pake backtick - table name di sini SELALU dari hasil query information_schema kita sendiri (bukan input user), tapi tetap di-escape sebagai praktik aman standar. */
function ident(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

function useProject(key: string) {
  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  return (projectsQuery.data ?? []).find((p) => p.key === key);
}

export default function CoolifyBrowseTableDetailScreen() {
  const { key, tableName } = useLocalSearchParams<{ key: string; tableName: string }>();
  const [tab, setTab] = useState<TabKey>('describe');
  const project = useProject(key);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: tableName }} />
      <View style={styles.tabBar}>
        <TabButton label="Struktur" active={tab === 'describe'} onPress={() => setTab('describe')} />
        <TabButton label="Jumlah Baris" active={tab === 'count'} onPress={() => setTab('count')} />
        <TabButton label="Preview" active={tab === 'preview'} onPress={() => setTab('preview')} />
      </View>
      {!project?.databaseUuid ? (
        <View style={styles.content}>
          <Text style={styles.muted}>Project/database gak ketemu.</Text>
        </View>
      ) : (
        <>
          {tab === 'describe' && <DescribeTab databaseUuid={project.databaseUuid} schemaName={project.schemaName} tableName={tableName} />}
          {tab === 'count' && <CountTab databaseUuid={project.databaseUuid} schemaName={project.schemaName} tableName={tableName} />}
          {tab === 'preview' && <PreviewTab databaseUuid={project.databaseUuid} schemaName={project.schemaName} tableName={tableName} />}
        </>
      )}
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

function DescribeTab({ databaseUuid, schemaName, tableName }: { databaseUuid: string; schemaName?: string; tableName: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['coolify-describe', databaseUuid, schemaName, tableName],
    queryFn: async () => {
      const res = await runCompanionDbQuery(
        databaseUuid,
        `SELECT column_name AS field, column_type AS type, is_nullable AS nullable, column_key AS col_key, column_default AS col_default, extra AS extra FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${tableName.replace(/'/g, "''")}' ORDER BY ordinal_position`,
        schemaName
      );
      return res.rows;
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {isLoading && <Text style={styles.muted}>Memuat struktur tabel...</Text>}
      {isError && <Text style={styles.errText}>{(error as Error)?.message}</Text>}
      {data?.map((col, i) => (
        <Card key={i}>
          <View style={styles.colHeader}>
            <Text style={styles.colName}>{String(col.field)}</Text>
            {col.col_key === 'PRI' && <Text style={styles.pkBadge}>PRIMARY</Text>}
          </View>
          <Text style={styles.colType}>{String(col.type)}</Text>
          <View style={styles.colMetaRow}>
            <Text style={styles.colMeta}>Null: {String(col.nullable)}</Text>
            <Text style={styles.colMeta}>Default: {col.col_default != null ? String(col.col_default) : '—'}</Text>
          </View>
          {col.extra ? <Text style={styles.colMeta}>{String(col.extra)}</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}

function CountTab({ databaseUuid, schemaName, tableName }: { databaseUuid: string; schemaName?: string; tableName: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['coolify-count', databaseUuid, schemaName, tableName],
    queryFn: async () => {
      const res = await runCompanionDbQuery(databaseUuid, `SELECT COUNT(*) AS total FROM ${ident(tableName)}`, schemaName);
      return Number(res.rows[0]?.total ?? 0);
    },
  });

  return (
    <View style={[styles.content, { alignItems: 'center', paddingTop: 60 }]}>
      {isLoading && <Text style={styles.muted}>Menghitung baris...</Text>}
      {isError && <Text style={styles.errText}>{(error as Error)?.message}</Text>}
      {data != null && (
        <>
          <Text style={styles.bigNumber}>{data.toLocaleString('id-ID')}</Text>
          <Text style={styles.muted}>total baris di tabel ini</Text>
        </>
      )}
    </View>
  );
}

function PreviewTab({ databaseUuid, schemaName, tableName }: { databaseUuid: string; schemaName?: string; tableName: string }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['coolify-preview', databaseUuid, schemaName, tableName],
    queryFn: async () => {
      const res = await runCompanionDbQuery(databaseUuid, `SELECT * FROM ${ident(tableName)} LIMIT 10`, schemaName);
      return res;
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {isLoading && <Text style={styles.muted}>Memuat preview...</Text>}
      {isError && <Text style={styles.errText}>{(error as Error)?.message}</Text>}
      {data?.rows.length === 0 && <Text style={styles.muted}>Tabel ini kosong.</Text>}
      {data?.rows.map((row, i) => (
        <Card key={i}>
          <Text style={styles.rowLabel}>Baris {i + 1}</Text>
          {data.columns.map((col) => (
            <View key={col} style={styles.fieldRow}>
              <Text style={styles.fieldKey}>{col}</Text>
              <Text style={styles.fieldValue}>{row[col] != null ? String(row[col]) : '—'}</Text>
            </View>
          ))}
        </Card>
      ))}
      {data && data.rows.length > 0 && <Text style={styles.muted}>Menampilkan maksimal 10 baris pertama.</Text>}
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
