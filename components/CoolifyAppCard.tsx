import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from './Card';
import { StatusPill } from './StatusPill';
import { colors, spacing } from '@/lib/theme';
import { ApiError } from '@/lib/api';
import {
  getCoolifyApplication,
  startCoolifyApplication,
  stopCoolifyApplication,
  restartCoolifyApplication,
} from '@/lib/coolifyApi';
import { getContainerRestartCount } from '@/lib/companionApi';

type ActionKind = 'start' | 'stop' | 'restart';

/**
 * Mirror PmAppCard.tsx SENGAJA - "workflow biar sama" (request user). Beda
 * utamanya: data status dari Coolify API (getCoolifyApplication) sementara
 * restart-count dari Companion API (docker.js) - 2 backend beda, 1 card.
 */
export function CoolifyAppCard({ name, applicationUuid, containerId }: { name: string; applicationUuid: string; containerId: string }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const busy = pending !== null;

  const appQuery = useQuery({
    queryKey: ['coolify-app', applicationUuid],
    queryFn: () => getCoolifyApplication(applicationUuid),
    refetchInterval: 15000,
  });
  const restartQuery = useQuery({
    queryKey: ['companion-restart-count', containerId],
    queryFn: () => getContainerRestartCount(containerId),
    refetchInterval: 15000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['coolify-app', applicationUuid] });
    qc.invalidateQueries({ queryKey: ['companion-restart-count', containerId] });
  }

  async function run(kind: ActionKind, fn: () => Promise<void>) {
    setPending(kind);
    try {
      await fn();
      invalidate();
    } catch (err) {
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan tak terduga.');
    } finally {
      setPending(null);
    }
  }

  function handleStop() {
    Alert.alert(
      `Stop "${name}"?`,
      'App ini bakal berhenti dan tidak bisa diakses sampai di-start/deploy lagi.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => run('stop', () => stopCoolifyApplication(applicationUuid)) },
      ]
    );
  }

  // "status" belum diverifikasi bentuknya persis apa dari Coolify API (lihat
  // catatan di coolifyApi.ts) - deteksi "online" dilonggarkan (includes,
  // bukan exact-match) supaya format kayak "running:healthy" tetap kebaca,
  // tapi kalau field-nya kosong/gak dikenal, StatusPill fallback nampilin
  // raw string apa adanya - bukan nebak jadi status yang salah.
  const rawStatus = appQuery.data?.status ?? (appQuery.isLoading ? undefined : 'unknown');
  const isOnline = typeof rawStatus === 'string' && rawStatus.toLowerCase().includes('running');
  const restartCount = restartQuery.data?.ok ? restartQuery.data.restartCount : null;
  const restartWarn = restartCount != null && restartCount >= 20 ? colors.red : restartCount != null && restartCount >= 5 ? colors.amber : undefined;

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>
            Coolify
            {restartCount != null ? (
              <Text style={restartWarn ? { color: restartWarn, fontWeight: '700' } : undefined}>
                {' · '}Restart {restartCount}x
              </Text>
            ) : restartQuery.isError ? (
              <Text style={{ color: colors.inkFaint }}> · Restart: gagal ambil data</Text>
            ) : null}
          </Text>
        </View>
        {appQuery.isError ? (
          <Text style={{ fontSize: 11, color: colors.red }}>
            {(appQuery.error as Error)?.message ?? 'Gagal ambil status'}
          </Text>
        ) : rawStatus ? (
          <StatusPill status={rawStatus} />
        ) : (
          <ActivityIndicator size="small" color={colors.inkFaint} />
        )}
      </View>
      <View style={styles.actions}>
        {isOnline ? (
          <>
            <ActionBtn
              icon="refresh"
              label="Restart"
              onPress={() => run('restart', () => restartCoolifyApplication(applicationUuid))}
              loading={pending === 'restart'}
              disabled={busy}
            />
            <ActionBtn
              icon="stop-outline"
              label="Stop"
              onPress={handleStop}
              loading={pending === 'stop'}
              disabled={busy}
              color={colors.amber}
            />
          </>
        ) : (
          <ActionBtn
            icon="play-outline"
            label="Start / Deploy"
            onPress={() => run('start', () => startCoolifyApplication(applicationUuid))}
            loading={pending === 'start'}
            disabled={busy}
            color={colors.green}
          />
        )}
      </View>
    </Card>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  loading,
  disabled,
  color,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  color?: string;
}) {
  const fg = color || colors.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.actionBtn, (pressed || disabled) && styles.actionBtnDisabled]}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={16} color={fg} />}
      <Text style={[styles.actionLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  actionBtnDisabled: { opacity: 0.5 },
  actionLabel: { fontSize: 12, fontWeight: '700' },
});
