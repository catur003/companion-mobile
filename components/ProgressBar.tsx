import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '@/lib/theme';

interface ProgressBarProps {
  percent: number | null | undefined;
  /** Kalau diisi, fill jadi warna solid ini (bukan gradient default). */
  color?: string;
}

/**
 * Bar tipis di bawah tiap metric (CPU/RAM/Disk), ala preview pastel -
 * fill-nya gradient ungu->pink asli (expo-linear-gradient), persis kayak
 * `.bar-fill` di preview HTML.
 * `percent` di-clamp ke 0-100 supaya nilai aneh dari API (null, >100,
 * negatif) gak bikin width style invalid / crash render.
 */
export function ProgressBar({ percent, color }: ProgressBarProps) {
  const safePercent = Math.max(0, Math.min(100, typeof percent === 'number' && Number.isFinite(percent) ? percent : 0));
  return (
    <View style={styles.track}>
      {color ? (
        <View style={[styles.fill, { width: `${safePercent}%`, backgroundColor: color }]} />
      ) : (
        <LinearGradient
          colors={[colors.accent, colors.accentPink]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${safePercent}%` }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 5,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    marginTop: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});
