import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { StatusPill } from '@/components/StatusPill';
import { colors, spacing } from '@/lib/theme';
import { runCompanionDbQuery, listRegisteredProjects, resetDatabasePassword } from '@/lib/companionApi';
import { getCoolifyDatabaseDetail, startCoolifyDatabase, stopCoolifyDatabase, restartCoolifyDatabase } from '@/lib/coolifyApi';
import { ApiError } from '@/lib/api';

type DbActionKind = 'start' | 'stop' | 'restart' | 'test';

export default function CoolifyBrowseTablesScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const projectsQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects, staleTime: 60000 });
  const project = (projectsQuery.data ?? []).find((p) => p.key === key);

  const dbStatusQuery = useQuery({
    queryKey: ['coolify-db-status', project?.databaseUuid],
    queryFn: () => getCoolifyDatabaseDetail(project!.databaseUuid!),
    enabled: Boolean(project?.databaseUuid),
    refetchInterval: 15000,
  });

  const [pending, setPending] = useState<DbActionKind | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);

  function invalidateStatus() {
    qc.invalidateQueries({ queryKey: ['coolify-db-status', project?.databaseUuid] });
  }

  async function runAction(kind: DbActionKind, fn: () => Promise<unknown>) {
    setPending(kind);
    try {
      const result = await fn();
      if (kind === 'test') {
        Alert.alert('Berhasil', 'Koneksi ke database berhasil (SELECT 1 sukses).');
      } else {
        invalidateStatus();
      }
      return result;
    } catch (err) {
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    } finally {
      setPending(null);
    }
  }

  const resetMutation = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!project?.databaseUuid) throw new ApiError('Database gak ketemu.', 'NO_DB');
      if (!newPassword.trim()) throw new ApiError('Isi password baru dulu.', 'EMPTY_PASSWORD');
      return resetDatabasePassword(project.databaseUuid, newPassword.trim(), confirmed);
    },
    onSuccess: (res) => {
      setNewPassword('');
      setShowResetForm(false);
      Alert.alert(
        'Password Diganti',
        `User "${res.username}" berhasil diganti password-nya. INGAT: update DATABASE_URL di env app yang connect ke DB ini, lalu redeploy - koneksi lama bakal putus.`
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        Alert.alert(
          'Konfirmasi Reset Password',
          'Semua app yang connect pakai password LAMA bakal terputus sampai env-nya diupdate. Lanjut?',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Ganti Password', style: 'destructive', onPress: () => resetMutation.mutate(true) },
          ]
        );
        return;
      }
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  const tablesQuery = useQuery({
    queryKey: ['coolify-browse-tables', project?.databaseUuid, project?.schemaName],
    queryFn: async () => {
      const res = await runCompanionDbQuery(
        project!.databaseUuid!,
        'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
        project!.schemaName
      );
      return res.rows.map((r) => String(r.name));
    },
    enabled: Boolean(project?.databaseUuid),
  });

  const tables = tablesQuery.data ?? [];
  const dbStatus = dbStatusQuery.data?.status;
  const isOnline = typeof dbStatus === 'string' && dbStatus.toLowerCase().includes('running');

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: project?.name ?? 'Database' }} />
      <FlatList
        data={tables}
        keyExtractor={(t) => t}
        contentContainerStyle={styles.content}
        onRefresh={tablesQuery.refetch}
        refreshing={tablesQuery.isRefetching}
        ListHeaderComponent={
          <>
            {project?.databaseUuid && (
              <Card style={{ marginBottom: spacing.md }}>
                <View style={styles.statusRow}>
                  <Text style={styles.cardTitle}>Status Database</Text>
                  {dbStatus ? <StatusPill status={dbStatus} /> : <ActivityIndicator size="small" color={colors.inkFaint} />}
                </View>
                <View style={styles.actionsRow}>
                  {isOnline ? (
                    <>
                      <MiniAction
                        label="Restart"
                        icon="refresh"
                        loading={pending === 'restart'}
                        disabled={pending !== null}
                        onPress={() => runAction('restart', () => restartCoolifyDatabase(project.databaseUuid!))}
                      />
                      <MiniAction
                        label="Stop"
                        icon="stop-outline"
                        color={colors.amber}
                        loading={pending === 'stop'}
                        disabled={pending !== null}
                        onPress={() =>
                          Alert.alert('Stop database?', 'App yang connect ke DB ini bakal gagal query sampai di-start lagi.', [
                            { text: 'Batal', style: 'cancel' },
                            {
                              text: 'Stop',
                              style: 'destructive',
                              onPress: () => runAction('stop', () => stopCoolifyDatabase(project.databaseUuid!)),
                            },
                          ])
                        }
                      />
                    </>
                  ) : (
                    <MiniAction
                      label="Start"
                      icon="play-outline"
                      color={colors.green}
                      loading={pending === 'start'}
                      disabled={pending !== null}
                      onPress={() => runAction('start', () => startCoolifyDatabase(project.databaseUuid!))}
                    />
                  )}
                  <MiniAction
                    label="Test Koneksi"
                    icon="pulse-outline"
                    loading={pending === 'test'}
                    disabled={pending !== null}
                    onPress={() => runAction('test', () => runCompanionDbQuery(project.databaseUuid!, 'SELECT 1', project.schemaName))}
                  />
                  <MiniAction
                    label="Reset Password"
                    icon="key-outline"
                    color={colors.red}
                    disabled={pending !== null}
                    onPress={() => setShowResetForm((v) => !v)}
                  />
                </View>

                {showResetForm && (
                  <View style={{ marginTop: spacing.sm }}>
                    <FormField
                      label="Password Baru"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      autoCapitalize="none"
                      placeholder="Password baru buat user DB ini"
                    />
                    <Button label="Ganti Password" variant="danger" loading={resetMutation.isPending} onPress={() => resetMutation.mutate(false)} />
                  </View>
                )}
              </Card>
            )}
            <Text style={styles.sectionTitle}>{tablesQuery.isLoading ? 'Memuat tabel...' : `${tables.length} Tabel`}</Text>
          </>
        }
        ListEmptyComponent={
          !tablesQuery.isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {tablesQuery.isError ? `Gagal ambil daftar tabel: ${(tablesQuery.error as Error)?.message}` : 'Belum ada tabel.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/database/coolify-browse/${encodeURIComponent(key)}/${encodeURIComponent(item)}`)}>
            <View style={styles.row}>
              <Text style={styles.name}>{item}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

function MiniAction({
  label,
  icon,
  onPress,
  loading,
  disabled,
  color,
}: {
  label: string;
  icon: any;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  const fg = color || colors.accent;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.miniBtn, (pressed || disabled) && { opacity: 0.5 }]}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={15} color={fg} />}
      <Text style={[styles.miniBtnLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, marginTop: spacing.md, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: spacing.sm },
  miniBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  miniBtnLabel: { fontSize: 11.5, fontWeight: '700' },
});
