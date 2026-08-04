import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Card } from './Card';
import { StatusPill } from './StatusPill';
import { colors, spacing } from '@/lib/theme';
import { pushIntoTab } from '@/lib/nav';
import { Pm2App, startPm2App, stopPm2App, restartPm2App, deletePm2App, ApiError } from '@/lib/api';

type ActionKind = 'start' | 'stop' | 'restart' | 'delete';

export function PmAppCard({ app }: { app: Pm2App }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const busy = pending !== null;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pm2-apps'] });
  }

  async function run(kind: ActionKind, fn: () => Promise<unknown>) {
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
      `Stop "${app.name}"?`,
      'App ini bakal berhenti dan tidak bisa diakses sampai di-start lagi.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Stop', style: 'destructive', onPress: () => run('stop', () => stopPm2App(app.name)) },
      ]
    );
  }

  function handleDelete() {
    Alert.alert(
      `Hapus "${app.name}" dari PM2?`,
      'Proses akan dihentikan dan entry-nya dibuang dari PM2 (file project di server TIDAK ikut terhapus). Tindakan ini tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => run('delete', () => deletePm2App(app.name)) },
      ]
    );
  }

  const isOnline = app.status === 'online';
  const goToGit = () => pushIntoTab(router, '/(tabs)/deploy', `/(tabs)/deploy/git/${encodeURIComponent(app.name)}`);
  // Threshold sengaja rendah (5) - restart manual sesekali normal, tapi kalau
  // angkanya udah segini di satu app, biasanya itu crash-loop yang lolos gak
  // ketauan karena "Ready in Xms" tetep muncul tiap kali sebelum crash lagi.
  const restartWarn = app.restartCount >= 20 ? colors.red : app.restartCount >= 5 ? colors.amber : undefined;

  return (
    <Card style={styles.card}>
      {/*
        Tap body (nama/status) = langsung ke detail Git project (Build,
        Seed, Environment, Hapus Project) - ini shortcut utama sekarang,
        request user: "kalau tap proyek maka masuk ke tab git". Tombol
        aksi cepat (Restart/Stop/Log/Hapus) di bawah TETAP terpisah &
        gak ikut ke-trigger tap ini (Pressable-nya beda area, bukan nested
        di dalam area yang sama).
      */}
      <Pressable
        onPress={goToGit}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Buka detail Git untuk ${app.name}`}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{app.name}</Text>
          <Text style={styles.meta}>
            PM2 · :{app.port} · CPU {app.cpu}
            {app.restartCount > 0 ? (
              <Text style={restartWarn ? { color: restartWarn, fontWeight: '700' } : undefined}>
                {' · '}Restart {app.restartCount}x
              </Text>
            ) : null}
          </Text>
        </View>
        <StatusPill status={app.status} />
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} style={{ marginLeft: 2 }} />
      </Pressable>
      <View style={styles.actions}>
        {isOnline ? (
          <>
            <ActionBtn
              icon="refresh"
              label="Restart"
              onPress={() => run('restart', () => restartPm2App(app.name))}
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
            label="Start"
            onPress={() => run('start', () => startPm2App(app.name))}
            loading={pending === 'start'}
            disabled={busy}
            color={colors.green}
          />
        )}
        <ActionBtn
          icon="terminal-outline"
          label="Log"
          onPress={() => pushIntoTab(router, '/(tabs)/deploy', `/(tabs)/deploy/logs/${encodeURIComponent(app.name)}`)}
          disabled={busy}
        />
        <ActionBtn
          icon="git-branch-outline"
          label="Git"
          onPress={goToGit}
          disabled={busy}
        />
        <ActionBtn
          icon="trash-outline"
          label="Hapus"
          onPress={handleDelete}
          loading={pending === 'delete'}
          disabled={busy}
          color={colors.red}
        />
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowPressed: { opacity: 0.6 },
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
