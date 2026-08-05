import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { colors, spacing } from '@/lib/theme';
import { getRecentAuditLog } from '@/lib/companionApi';
import { getActionLabel, getContextSummary, formatRelativeTime } from '@/lib/auditLabels';

/**
 * Riwayat aktivitas Companion API (5 Agustus 2026) - baca dari audit.log
 * yang UDAH ADA dari awal (tiap action tercatat sejak Fase 3), cuma belum
 * ada UI-nya. Data mentahnya flat JSON per baris - di sini di-render jadi
 * teks manusiawi (label Bahasa Indonesia, bukan action string mentah),
 * TANPA emoji/icon sesuai arahan - status pakai warna teks aja.
 */
export default function AuditLogScreen() {
  const query = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => getRecentAuditLog(50),
  });

  const entries = query.data ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={colors.accent} />}
    >
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          50 aktivitas terakhir dari Companion API. Kredensial (password, token) gak pernah dicatat di sini.
        </Text>
      </Card>

      {query.isLoading && (
        <Card>
          <Text style={styles.mutedText}>Memuat riwayat...</Text>
        </Card>
      )}

      {query.isError && (
        <Card>
          <Text style={styles.errorText}>Gagal ambil riwayat aktivitas. Tarik ke bawah buat coba lagi.</Text>
        </Card>
      )}

      {!query.isLoading && !query.isError && entries.length === 0 && (
        <Card>
          <Text style={styles.mutedText}>Belum ada aktivitas tercatat.</Text>
        </Card>
      )}

      {entries.map((entry, i) => {
        const ok = entry.ok !== false; // field "ok" gak selalu diisi (mis. db:migrate) - anggap sukses kalau gak eksplisit false
        const context = getContextSummary(entry);
        return (
          <Card key={`${entry.timestamp}-${i}`}>
            <View style={styles.row}>
              <Text style={styles.actionLabel} numberOfLines={1}>{getActionLabel(entry.action)}</Text>
              <Text style={[styles.statusText, ok ? styles.statusOk : styles.statusFail]}>
                {ok ? 'Sukses' : 'Gagal'}
              </Text>
            </View>
            {context && (
              <Text style={styles.contextText} numberOfLines={2}>{context}</Text>
            )}
            <Text style={styles.timeText}>{formatRelativeTime(entry.timestamp)}</Text>
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  errorText: { fontSize: 13, color: colors.red, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionLabel: { fontSize: 13.5, fontWeight: '700', color: colors.ink, flex: 1, marginRight: spacing.sm },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusOk: { color: colors.green },
  statusFail: { color: colors.red },
  contextText: { fontSize: 11.5, color: colors.inkMuted, fontFamily: 'monospace', marginTop: 4 },
  timeText: { fontSize: 11, color: colors.inkFaint, marginTop: 4 },
});
