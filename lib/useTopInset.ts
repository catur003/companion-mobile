import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from './theme';

/**
 * Fase I fix: semua screen root tab (Dashboard, Database, Deploy, Diagnostik,
 * Setelan) dulunya pakai `paddingTop` ANGKA TETAP (`spacing.xl` = 24, atau di
 * Database/Deploy malah 0 sama sekali) buat jaga jarak dari status bar.
 *
 * Itu kebetulan cukup di sebagian device, tapi SALAH secara prinsip: Expo SDK
 * 54 + Android baru maksa render edge-to-edge (konten benar-benar nembus ke
 * belakang status bar/gesture-nav, bukan cuma opsi) - tinggi status bar beda-
 * beda tiap device/OS (notch, punch-hole, dsb), jadi angka tetap PASTI ada
 * device yang ke-nembus (kejadian nyata di tab Setelan, dilaporkan user).
 *
 * Fix: ambil `insets.top` beneran dari `react-native-safe-area-context`
 * (sudah ke-install & `SafeAreaProvider` sudah dipasang di root sejak Fase A,
 * cuma belum dipakai di level screen) + sedikit spacing tambahan biar gak
 * terlalu mepet ke tepi insets-nya sendiri.
 */
export function useTabTopPadding(extra: number = spacing.md): number {
  const insets = useSafeAreaInsets();
  return insets.top + extra;
}
