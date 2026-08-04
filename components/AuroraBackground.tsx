import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '@/lib/theme';

/**
 * Latar animasi "mesh gradient" ala konsep Aurora Glass (lihat
 * `zenhub-aurora-preview.html` yang dikasih user) - beberapa blob warna yang
 * perlahan bergeser, membesar-mengecil, dan berputar tipis, dipasang SEKALI
 * di `(tabs)/_layout.tsx` di balik seluruh Tabs (bukan per-layar) biar
 * animasinya kontinu gak keulang dari awal tiap pindah tab.
 *
 * React Native gak punya `filter:blur()` bawaan kayak CSS, jadi "blur"-nya
 * didekati pakai beberapa lingkaran warna sama bertumpuk dengan opacity makin
 * ke tengah makin pekat (mirip radial gradient yang di-blur) - teknik ini
 * gak butuh dependency native tambahan/rebuild, cukup Animated bawaan RN.
 *
 * Warnanya ikut `colors.auroraColors` tema aktif (mutate bareng ganti tema -
 * lihat `lib/theme.ts` & `lib/ThemeContext.tsx`), jadi komponen ini otomatis
 * ganti warna pas user ganti tema di Setelan tanpa perlu prop apapun.
 */

interface BlobSpec {
  color: string;
  size: number;
  posStyle: { top?: number; left?: number; right?: number; bottom?: number };
  duration: number;
  driftX: number;
  driftY: number;
  growBy: number;
  reverse?: boolean;
}

// Tiap blob dirender sebagai 4 lingkaran senada bertumpuk, makin ke dalam
// makin kecil & makin pekat - dari jauh matanya "baca" ini sebagai satu
// gumpalan cahaya lembut, bukan lingkaran solid bertepi tajam.
const LAYER_SCALES = [1, 0.72, 0.46, 0.24];
const LAYER_OPACITIES = [0.14, 0.22, 0.34, 0.5];

function Blob({ spec }: { spec: BlobSpec }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: spec.duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dir = spec.reverse ? -1 : 1;
  const translateX = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, spec.driftX * dir, -spec.driftX * 0.55 * dir, 0],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0, spec.driftY * dir, spec.driftY * 0.35 * dir, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [1, 1 + spec.growBy, 1 - spec.growBy * 0.45, 1],
  });

  return (
    <Animated.View
      style={[
        styles.blobWrap,
        spec.posStyle,
        { width: spec.size, height: spec.size, transform: [{ translateX }, { translateY }, { scale }] },
      ]}
    >
      {LAYER_SCALES.map((scaleFactor, i) => {
        const layerSize = spec.size * scaleFactor;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: layerSize,
              height: layerSize,
              left: (spec.size - layerSize) / 2,
              top: (spec.size - layerSize) / 2,
              borderRadius: layerSize / 2,
              backgroundColor: spec.color,
              opacity: LAYER_OPACITIES[i],
            }}
          />
        );
      })}
    </Animated.View>
  );
}

export function AuroraBackground() {
  const { width, height } = useWindowDimensions();
  const palette = colors.auroraColors;

  const blobs: BlobSpec[] = useMemo(
    () => [
      {
        color: palette[0],
        size: width * 1.4,
        posStyle: { top: -height * 0.14, left: -width * 0.25 },
        duration: 22000,
        driftX: 46,
        driftY: 64,
        growBy: 0.16,
      },
      {
        color: palette[1],
        size: width * 1.3,
        posStyle: { top: height * 0.14, right: -width * 0.3 },
        duration: 28000,
        driftX: 62,
        driftY: 40,
        growBy: 0.13,
      },
      {
        color: palette[2],
        size: width * 1.5,
        posStyle: { bottom: -height * 0.2, left: -width * 0.12 },
        duration: 34000,
        driftX: 32,
        driftY: 46,
        growBy: 0.2,
      },
      {
        color: palette[3],
        size: width * 1.15,
        posStyle: { bottom: height * 0.06, right: -width * 0.2 },
        duration: 40000,
        driftX: 36,
        driftY: 28,
        growBy: 0.1,
        reverse: true,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height, palette[0], palette[1], palette[2], palette[3]]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blobs.map((spec, i) => (
        <Blob key={i} spec={spec} />
      ))}
      {/* Wash tipis biar teks/card di atasnya tetap kebaca - sama filosofi
          kayak `.wash` di preview (opacity rendah, aurora tetap nembus). */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, opacity: 0.22 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  blobWrap: { position: 'absolute' },
});
