import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';
import { JobStatus } from '@/lib/api';

const MAP: Record<string, { label: string; fg: string; bg: string }> = {
  success: { label: 'Berhasil', fg: colors.green, bg: colors.greenSoft },
  running: { label: 'Proses', fg: colors.amber, bg: colors.amberSoft },
  pending: { label: 'Menunggu', fg: colors.amber, bg: colors.amberSoft },
  failed: { label: 'Gagal', fg: colors.red, bg: colors.redSoft },
  interrupted: { label: 'Terputus', fg: colors.red, bg: colors.redSoft },
  active: { label: 'Aktif', fg: colors.green, bg: colors.greenSoft },
  online: { label: 'Online', fg: colors.green, bg: colors.greenSoft },
  stopped: { label: 'Stopped', fg: colors.inkFaint, bg: colors.divider },
  errored: { label: 'Error', fg: colors.red, bg: colors.redSoft },
  'never started': { label: 'Belum pernah start', fg: colors.amber, bg: colors.amberSoft },
};

export function StatusPill({ status }: { status: JobStatus | string }) {
  const cfg = MAP[status] ?? { label: status, fg: colors.inkMuted, bg: colors.divider };
  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <View style={[styles.dot, { backgroundColor: cfg.fg }]} />
      <Text style={[styles.label, { color: cfg.fg }]}>{cfg.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm + 2,
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700' },
});
