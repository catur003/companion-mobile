import { PropsWithChildren, useRef } from 'react';
import { View, StyleSheet, ViewStyle, Pressable, Animated } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface CardProps extends PropsWithChildren {
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Micro-interaction: card yang bisa di-tap "menyusut" dikit (scale 0.97)
 * pas ditekan, balik pas dilepas - spring, bukan linear, biar kerasa
 * "hidup"/tactile ala native iOS/Material, bukan cuma ganti opacity doang.
 *
 * BUG FIX: versi sebelumnya bungkus Pressable pakai `<Animated.View>`
 * TAMBAHAN di luarnya buat nampung `transform`. Masalahnya, `Animated.View`
 * itu gak punya lebar eksplisit - jadi kalau caller kirim `style={{ width:
 * '47%' }}` (mis. kartu Aksi Cepat di Dashboard), persentase itu nge-resolve
 * relatif ke wrapper yang gak jelas lebarnya (bukan ke grid parent asli),
 * collapse jadi sempit, dan teksnya kepaksa wrap satu huruf per baris.
 * Fix: animasikan `Pressable`-nya LANGSUNG lewat `Animated.createAnimatedComponent`
 * - gak ada layer View ekstra sama sekali, jadi `style` (termasuk width %)
 * tetap resolve ke parent yang bener persis kayak sebelum ada animasi ini.
 */
export function Card({ children, onPress, style }: CardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = scale.interpolate({ inputRange: [0.97, 1], outputRange: [0.7, 1] });

  if (onPress) {
    const animateTo = (value: number) => {
      Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
    };
    return (
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={[styles.card, style, { transform: [{ scale }], opacity }]}
      >
        {children}
      </AnimatedPressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
