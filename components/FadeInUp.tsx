import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface FadeInUpProps {
  children: React.ReactNode;
  /** Index item di list - dipakai buat hitung delay stagger (item ke-2 nyusul dikit dari item ke-1, dst). */
  index?: number;
  /** Delay dasar per index, ms. Di-cap (lihat di bawah) biar list panjang gak jadi lelet keliatan animasinya. */
  staggerMs?: number;
}

/**
 * Wrapper animasi masuk buat item list (card project/app) - fade + geser
 * naik dikit, di-stagger per index biar keliatan "mengalir" bukan muncul
 * bareng flat sekaligus. Delay di-cap di 6 item pertama (`Math.min(index, 6)`)
 * biar list yang isinya puluhan app gak bikin item terakhir nunggu lama
 * cuma buat konsisten stagger - di atas 6 item, delay-nya disamain aja.
 */
export function FadeInUp({ children, index = 0, staggerMs = 60 }: FadeInUpProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const delay = Math.min(index, 6) * staggerMs;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 260, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 260, delay, useNativeDriver: true }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ]).start();
  }, []);

  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}
