import { useRef } from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps {
  label: string;
  onPress: () => void;
  // "warning" (amber) BARU (5 Agustus 2026) - buat aksi resiko-sedang (mis.
  // "Seed" data, nambah/nimpa data tapi biasanya bisa diulang) yang beda
  // kelas dari "danger" (merah, buat aksi DESTRUKTIF PERMANEN kayak push
  // --accept-data-loss/hapus database). User minta dibedain, sebelumnya
  // dua-duanya kepaksa sama-sama merah.
  variant?: 'primary' | 'danger' | 'warning' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const bg =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.red : variant === 'warning' ? colors.amber : colors.card;
  const fg = variant === 'secondary' ? colors.ink : colors.onAccent;
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  const animateTo = (value: number) => {
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  };

  // Opacity diturunkan dari `scale` yang sama (bukan dari Pressable's
  // `pressed` render-prop) - `Animated.createAnimatedComponent` gak reliable
  // kalau `style` berupa FUNCTION (kombinasi itu gak terdokumentasi resmi
  // buat nemuin AnimatedValue di dalamnya). Baseline saat gak ditekan tetap
  // ngikutin `disabled`, dan pas ditekan (scale->0.96) turun dikit lagi.
  const restOpacity = isDisabled ? 0.6 : 1;
  const opacity = scale.interpolate({ inputRange: [0.96, 1], outputRange: [restOpacity * 0.85, restOpacity] });

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => !isDisabled && animateTo(0.96)}
      onPressOut={() => animateTo(1)}
      disabled={isDisabled}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity, transform: [{ scale }] },
        variant === 'secondary' && styles.secondaryBorder,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.label, { color: fg }]}>{label}</Text>}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBorder: { borderWidth: 1, borderColor: colors.divider },
  label: { fontWeight: '700', fontSize: 14 },
});
