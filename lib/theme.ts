/**
 * Design tokens. Warna (`colors`) diambil dari registry `themes.ts` -
 * TIDAK ada hex yang di-hardcode di file ini atau di komponen manapun.
 *
 * PENTING: `colors` sengaja BUKAN object baru tiap render - dia satu
 * referensi object yang sama sepanjang hidup app, dan isinya di-MUTATE
 * (Object.assign) oleh `ThemeContext.tsx` pas user ganti tema. Ini dipilih
 * ketimbang bikin semua ~30 file yang pakai `colors.xxx` pindah ke hook
 * `useTheme()` (refactor gede, effort tinggi buat hasil yang sama). Karena
 * `ThemeProvider` re-render lewat context tiap ganti tema, dan React
 * default-nya cascade re-render ke semua descendant (SELAMA gak ada
 * `React.memo` di antaranya - dicek, gak ada satupun komponen di app ini yang
 * di-memo), tiap komponen otomatis kebaca ulang `colors.xxx` dengan nilai
 * baru pas render berikutnya, walau importnya statis di top-level file.
 */

import { themes, ACTIVE_THEME, ThemeColors } from './themes';

export const colors: ThemeColors = { ...themes[ACTIVE_THEME] };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const mono = {
  // Font monospace bawaan platform - cukup buat kesan "terminal" tanpa perlu
  // load custom font. Kalau mau persis kayak preview (JetBrains Mono), tinggal
  // tambah `expo-font` + `@expo-google-fonts/jetbrains-mono` lalu ganti value ini.
  fontFamily: 'monospace',
};
