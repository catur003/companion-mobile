import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from './Card';
import { StatusPill } from './StatusPill';
import { colors, spacing } from '@/lib/theme';
import { ApiError } from '@/lib/api';
import { pushIntoTab } from '@/lib/nav';
import {
  getCoolifyApplication,
  startCoolifyApplication,
  stopCoolifyApplication,
  restartCoolifyApplication,
  findActiveDeploymentForApp,
} from '@/lib/coolifyApi';
import { getApplicationRestartCount } from '@/lib/companionApi';

type ActionKind = 'start' | 'stop' | 'restart';

// "start" DAN "restart" dua-duanya trigger REDEPLOY PENUH buat app berbasis
// Git (Nixpacks) - dikonfirmasi dari dokumentasi resmi Coolify: restart
// "For git-based applications, this triggers a redeployment" (BUKAN cuma
// restart proses kayak asumsi awal). Cuma "stop" yang beneran ringan.
const SETTLE_MS: Record<ActionKind, number> = {
  start: 90000,
  restart: 90000,
  stop: 15000,
};

/**
 * Mirror PmAppCard.tsx SENGAJA - "workflow biar sama" (request user). Beda
 * utamanya: data status dari Coolify API (getCoolifyApplication) sementara
 * restart-count dari Companion API (docker.js) - 2 backend beda, 1 card.
 *
 * UBAH (4 Agustus 2026): dulu terima containerId terpisah - dihapus, cukup
 * applicationUuid buat SEMUANYA (Coolify status + Companion API restart-count).
 * Container ID Docker mentah BERUBAH tiap redeploy, applicationUuid Coolify
 * TETAP - backend Companion API resolve container aktif sendiri sekarang.
 */
export function CoolifyAppCard({ name, applicationUuid }: { name: string; applicationUuid: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, setPending] = useState<ActionKind | null>(null);
  const busy = pending !== null;

  // "settling" - abis start/stop/restart, Coolify proses async (dispatch job
  // deploy, gak langsung selesai). Polling dipercepat sementara + status pill
  // diganti "Memproses..." biar user gak ngira app-nya nge-freeze pas
  // sebenernya masih transisi. Durasi beda per action (lihat SETTLE_MS) -
  // safety net kalau status gak kunjung berubah dari yang diharapkan.
  const [settling, setSettling] = useState(false);
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
    };
  }, []);

  const appQuery = useQuery({
    queryKey: ['coolify-app', applicationUuid],
    queryFn: () => getCoolifyApplication(applicationUuid),
    refetchInterval: settling ? 3000 : 15000,
  });
  const restartQuery = useQuery({
    queryKey: ['companion-restart-count', applicationUuid],
    queryFn: () => getApplicationRestartCount(applicationUuid),
    refetchInterval: settling ? 3000 : 15000,
  });
  // Sumber kebenaran akurat "lagi deploy apa nggak" - BEDA dari "settling"
  // (itu cuma timer buta abis klik tombol). Ini beneran cek ke Coolify.
  // Nempel DI SAMPING status Online, BUKAN nggantiin - app bisa "Online"
  // DAN "lagi deploy" bersamaan (zero-downtime: container lama masih
  // ngelayanin traffic sampai yang baru siap, itu bukan bug).
  const activeDeployQuery = useQuery({
    queryKey: ['active-deployment', applicationUuid],
    queryFn: () => findActiveDeploymentForApp(applicationUuid),
    refetchInterval: 5000,
  });
  const isDeploying = Boolean(activeDeployQuery.data);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['coolify-app', applicationUuid] });
    qc.invalidateQueries({ queryKey: ['companion-restart-count', applicationUuid] });
  }

  async function run(kind: ActionKind, fn: () => Promise<{ deployment_uuid?: string } | void>) {
    setPending(kind);
    try {
      await fn();
      invalidate();
      setSettling(true);
      // FIX (5 Agustus 2026, bug nyata: badge "Deploy..." nyangkut selamanya)
      // - SEBELUMNYA timer ini dipasang di useEffect yang ngecek state
      // "pending", tapi "pending" udah ke-null-in duluan (finally block)
      // SEBELUM effect-nya sempet baca - race condition, setTimeout gak
      // pernah kepasang. Sekarang dipasang LANGSUNG di sini, pake "kind"
      // (closure variable, bukan state) - gak ada race sama sekali.
      if (settleTimeoutRef.current) clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = setTimeout(() => setSettling(false), SETTLE_MS[kind] ?? 20000);
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

  // BARU (5 Agustus 2026) - domain di card sebelumnya cuma teks statis, gak
  // bisa di-tap. Tap = langsung buka di browser (paling sering dipakai: cek
  // app abis deploy). Long-press = copy ke clipboard (buat share link).
  // Pakai `onPress`/`onLongPress` BAWAAN <Text> - gak perlu bungkus Pressable
  // terpisah, karena domain ini nempel di tengah kalimat <Text> lain
  // (Pressable gak bisa nested di dalam Text di React Native).
  function handleDomainPress() {
    const fqdn = appQuery.data?.fqdn;
    if (!fqdn) return;
    const url = fqdn.startsWith('http') ? fqdn : `https://${fqdn}`;
    Linking.openURL(url).catch(() => Alert.alert('Gagal Buka', 'Gak bisa buka domain ini di browser.'));
  }

  async function handleDomainCopy() {
    const fqdn = appQuery.data?.fqdn;
    if (!fqdn) return;
    await Clipboard.setStringAsync(fqdn.replace(/^https?:\/\//, ''));
    Alert.alert('Disalin', 'Domain udah disalin ke clipboard.');
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
  // CATATAN: sengaja gak coba deteksi "udah kelar transisi" dari isi rawStatus
  // - build/deploy Coolify butuh waktu, dan app tetap bisa lapor status lama
  // selama proses jalan (container lama belum diganti). Gak ada cara aman
  // bedain "masih proses" vs "udah final" cuma dari string status doang tanpa
  // data lebih (mis. deployment job status terpisah) - jadi settling murni
  // pakai timeout tetap (20 detik) di atas, bukan heuristik yang bisa salah.

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>
            Coolify
            {appQuery.data?.fqdn ? (
              <>
                {' '}
                <Text style={{ color: appQuery.data.fqdn.includes('.sslip.io') ? colors.amber : colors.green }}>•</Text>
                {' '}
                <Text
                  style={styles.domainLink}
                  onPress={handleDomainPress}
                  onLongPress={handleDomainCopy}
                  suppressHighlighting
                >
                  {appQuery.data.fqdn.replace(/^https?:\/\//, '')}
                </Text>
              </>
            ) : null}
            {restartCount != null ? (
              <Text style={restartWarn ? { color: restartWarn, fontWeight: '700' } : undefined}>
                {' '}<Text style={{ color: colors.inkFaint }}>•</Text>{' '}Restart {restartCount}x
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
        ) : (
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {rawStatus ? <StatusPill status={rawStatus} /> : <ActivityIndicator size="small" color={colors.inkFaint} />}
            {/* FIX (5 Agustus 2026, bug nyata: badge nyangkut lama walau
                proses aslinya udah kelar) - SEBELUMNYA "settling" (timer
                buta SETTLE_MS) ikut nentuin badge, jadi walau isDeploying
                (deteksi ASLI) udah balik false duluan, badge tetep maksa
                nongol sampe timer abis. Sekarang badge CUMA ngikutin
                isDeploying + pending (lagi manggil API-nya doang, itungan
                detik) - "settling" cuma dipake buat percepat polling
                (refetchInterval di atas), gak lagi nentuin tampilan badge. */}
            {(isDeploying || pending !== null) && (
              <View style={styles.settlingPill}>
                <ActivityIndicator size="small" color={colors.amber} />
                <Text style={styles.settlingLabel}>Deploy...</Text>
              </View>
            )}
          </View>
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
        <ActionBtn
          icon="terminal-outline"
          label="Log"
          onPress={() =>
            pushIntoTab(
              router,
              '/(tabs)/deploy',
              `/(tabs)/deploy/coolify-logs?applicationUuid=${encodeURIComponent(applicationUuid)}`
            )
          }
          disabled={busy}
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  domainLink: { color: colors.accent, textDecorationLine: 'underline' },
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
  settlingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.amberSoft,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
  },
  settlingLabel: { fontSize: 11, fontWeight: '700', color: colors.amber },
});
