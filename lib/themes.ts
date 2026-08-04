/**
 * Registry semua tema warna yang tersedia. `theme.ts` cuma mengambil satu
 * entry dari sini lewat `ACTIVE_THEME` - jadi kalau nanti mau nambah fitur
 * "ganti tema" di Settings, tinggal:
 *   1. Tambah palette baru di bawah (harus match `ThemeColors`)
 *   2. Bikin `theme.ts` baca nama tema aktif (mis. dari storage) bukan
 *      konstanta `ACTIVE_THEME` yang di-hardcode
 * Gak ada satupun komponen yang perlu diubah, karena semua komponen cuma
 * kenal `colors.xxx`, bukan hex langsung.
 */

export interface ThemeColors {
  bg: string;
  card: string;
  cardBorder: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;

  accent: string;
  accentPink: string;
  accentSoft: string;
  accentPinkSoft: string;
  /** Warna teks/icon di atas permukaan ber-background `accent` (tombol, banner, FAB). */
  onAccent: string;

  green: string;
  greenSoft: string;
  amber: string;
  amberSoft: string;
  blue: string;
  blueSoft: string;
  red: string;
  redSoft: string;

  divider: string;

  /**
   * Warna blob buat latar "Aurora" (lihat `components/AuroraBackground.tsx`)
   * - array 4 hex, DIPAKAI APA ADANYA (bukan disederhanain jadi 1 warna
   * flat). Urutannya = urutan blob dari kiri-atas ke kanan-bawah. Tema
   * "pastel" (default) pakai warna PERSIS dari preview `zenhub-aurora-
   * preview.html` (iris/orchid/peach/teal) - tema lain pakai palet sendiri
   * biar tetap konsisten sama aksen masing-masing tema.
   */
  auroraColors: [string, string, string, string];

  // ---- terminal (layar log job - sengaja dark permanen di semua tema,
  // lihat catatan di TerminalLog.tsx) ----
  termBg: string;
  termCardBg: string;
  termBorder: string;
  termText: string;
  termMuted: string;
  termGreen: string;
  termAmber: string;
  termRed: string;
  termBlue: string;
  /** Titik "traffic light" ala macOS di title bar terminal - dekoratif, gak ikut tema. */
  termDotRed: string;
  termDotAmber: string;
  termDotGreen: string;
}

export type ThemeName = 'pastel' | 'slate' | 'ocean' | 'sunset' | 'forest';

export interface ThemeMeta {
  name: ThemeName;
  label: string;
  description: string;
  /** Dipakai StatusBar (app/_layout.tsx) buat milih style 'light'/'dark' teks status bar. */
  isDark: boolean;
  /** Dipakai buat render swatch bulat kecil di picker Setelan - gak perlu render seluruh palette. */
  preview: { bg: string; accent: string; accentPink: string };
}

export const themes: Record<ThemeName, ThemeColors> = {
  pastel: {
    bg: '#F5EFFB',
    card: 'rgba(255,255,255,0.82)',
    cardBorder: 'rgba(255,255,255,0.9)',
    ink: '#1E1B2E',
    inkMuted: '#6B6480',
    inkFaint: '#9B94B0',

    accent: '#8B5CF6',
    accentPink: '#EC4899',
    accentSoft: 'rgba(139,92,246,0.12)',
    accentPinkSoft: 'rgba(236,72,153,0.12)',
    onAccent: '#FFFFFF',

    green: '#16A34A',
    greenSoft: 'rgba(34,197,94,0.12)',
    amber: '#D97706',
    amberSoft: 'rgba(245,158,11,0.12)',
    blue: '#2563EB',
    blueSoft: 'rgba(59,130,246,0.12)',
    red: '#DC2626',
    redSoft: 'rgba(239,68,68,0.12)',

    divider: '#E9E1F5',

    // Persis dari preview: --iris, --orchid, --peach, --teal.
    auroraColors: ['#2E9BF0', '#5EC8F2', '#8FE3E8', '#3E7BD6'],

    termBg: '#1E1B2E',
    termCardBg: '#241F38',
    termBorder: '#3A3555',
    termText: '#C4BDD9',
    termMuted: '#7C7399',
    termGreen: '#4ADE80',
    termAmber: '#FBBF24',
    termRed: '#F85149',
    termBlue: '#79C0FF',
    termDotRed: '#F85149',
    termDotAmber: '#E3B341',
    termDotGreen: '#7EE787',
  },

  slate: {
    bg: '#F3F4F7',
    card: 'rgba(255,255,255,0.92)',
    cardBorder: '#E6E8EE',
    ink: '#1A1D29',
    inkMuted: '#5B6072',
    inkFaint: '#9498A8',

    accent: '#4F46E5',
    accentPink: '#7C3AED',
    accentSoft: 'rgba(79,70,229,0.1)',
    accentPinkSoft: 'rgba(124,58,237,0.1)',
    onAccent: '#FFFFFF',

    green: '#16A34A',
    greenSoft: 'rgba(34,197,94,0.12)',
    amber: '#D97706',
    amberSoft: 'rgba(245,158,11,0.12)',
    blue: '#2563EB',
    blueSoft: 'rgba(59,130,246,0.12)',
    red: '#DC2626',
    redSoft: 'rgba(239,68,68,0.12)',

    divider: '#E6E8EE',

    // Palet sendiri (bukan preview "Slate Night" yang gelap - tema "slate"
    // di app ini terang) - diturunkan dari accent/accentPink indigo/violet.
    auroraColors: ['#4F46E5', '#7C3AED', '#6E56CF', '#8B7FD9'],

    termBg: '#14161F',
    termCardBg: '#1B1E2A',
    termBorder: '#2E3242',
    termText: '#C7CAD6',
    termMuted: '#767B8F',
    termGreen: '#4ADE80',
    termAmber: '#FBBF24',
    termRed: '#F85149',
    termBlue: '#79C0FF',
    termDotRed: '#F85149',
    termDotAmber: '#E3B341',
    termDotGreen: '#7EE787',
  },

  ocean: {
    bg: '#EEF6FB',
    card: 'rgba(255,255,255,0.85)',
    cardBorder: 'rgba(255,255,255,0.9)',
    ink: '#132530',
    inkMuted: '#4E7385',
    inkFaint: '#8DAAB8',

    accent: '#0EA5E9',
    accentPink: '#06B6D4',
    accentSoft: 'rgba(14,165,233,0.12)',
    accentPinkSoft: 'rgba(6,182,212,0.12)',
    onAccent: '#FFFFFF',

    green: '#16A34A',
    greenSoft: 'rgba(34,197,94,0.12)',
    amber: '#D97706',
    amberSoft: 'rgba(245,158,11,0.12)',
    blue: '#2563EB',
    blueSoft: 'rgba(59,130,246,0.12)',
    red: '#DC2626',
    redSoft: 'rgba(239,68,68,0.12)',

    divider: '#DCEAF2',

    // 2 warna terakhir persis dari swatch "Ocean" di preview.
    auroraColors: ['#0EA5E9', '#06B6D4', '#2FB4C9', '#39C9B0'],

    termBg: '#0B1F2A',
    termCardBg: '#102935',
    termBorder: '#1F3E4C',
    termText: '#BFDCE8',
    termMuted: '#6E93A2',
    termGreen: '#4ADE80',
    termAmber: '#FBBF24',
    termRed: '#F85149',
    termBlue: '#79C0FF',
    termDotRed: '#F85149',
    termDotAmber: '#E3B341',
    termDotGreen: '#7EE787',
  },

  sunset: {
    bg: '#FDF3EC',
    card: 'rgba(255,255,255,0.85)',
    cardBorder: 'rgba(255,255,255,0.9)',
    ink: '#2E1E14',
    inkMuted: '#8A6A55',
    inkFaint: '#BEA491',

    accent: '#F97316',
    accentPink: '#EF4444',
    accentSoft: 'rgba(249,115,22,0.13)',
    accentPinkSoft: 'rgba(239,68,68,0.13)',
    onAccent: '#FFFFFF',

    green: '#16A34A',
    greenSoft: 'rgba(34,197,94,0.12)',
    amber: '#D97706',
    amberSoft: 'rgba(245,158,11,0.12)',
    blue: '#2563EB',
    blueSoft: 'rgba(59,130,246,0.12)',
    red: '#DC2626',
    redSoft: 'rgba(239,68,68,0.12)',

    divider: '#F3E1D3',

    // 2 warna terakhir persis dari swatch "Sunset" di preview.
    auroraColors: ['#F97316', '#EF4444', '#FF9E7D', '#E5484D'],

    termBg: '#231409',
    termCardBg: '#2E1C0D',
    termBorder: '#4A2E17',
    termText: '#E8CDB8',
    termMuted: '#9B7A61',
    termGreen: '#4ADE80',
    termAmber: '#FBBF24',
    termRed: '#F85149',
    termBlue: '#79C0FF',
    termDotRed: '#F85149',
    termDotAmber: '#E3B341',
    termDotGreen: '#7EE787',
  },

  forest: {
    bg: '#F1F7EF',
    card: 'rgba(255,255,255,0.85)',
    cardBorder: 'rgba(255,255,255,0.9)',
    ink: '#1B2A1E',
    inkMuted: '#59745D',
    inkFaint: '#96AC98',

    accent: '#16A34A',
    accentPink: '#84CC16',
    accentSoft: 'rgba(22,163,74,0.12)',
    accentPinkSoft: 'rgba(132,204,22,0.14)',
    onAccent: '#FFFFFF',

    green: '#16A34A',
    greenSoft: 'rgba(34,197,94,0.12)',
    amber: '#D97706',
    amberSoft: 'rgba(245,158,11,0.12)',
    blue: '#2563EB',
    blueSoft: 'rgba(59,130,246,0.12)',
    red: '#DC2626',
    redSoft: 'rgba(239,68,68,0.12)',

    divider: '#E1EDE0',

    // Gak ada di preview - diturunkan dari accent/accentPink hijau/lime.
    auroraColors: ['#16A34A', '#84CC16', '#5FD38D', '#22C55E'],

    termBg: '#101A11',
    termCardBg: '#162217',
    termBorder: '#2B3F2D',
    termText: '#C7DCC5',
    termMuted: '#7C9A7E',
    termGreen: '#4ADE80',
    termAmber: '#FBBF24',
    termRed: '#F85149',
    termBlue: '#79C0FF',
    termDotRed: '#F85149',
    termDotAmber: '#E3B341',
    termDotGreen: '#7EE787',
  },
};

/** Metadata buat render picker tema di Setelan - urutan di sini = urutan tampil. */
export const THEME_LIST: ThemeMeta[] = [
  { name: 'pastel', label: 'Aurora Glass', description: 'Default - ungu & pink lembut, latar mesh gradient hidup', isDark: false, preview: { bg: '#F5EFFB', accent: '#8B5CF6', accentPink: '#EC4899' } },
  { name: 'slate', label: 'Slate', description: 'Terang, netral abu-abu, aksen indigo - clean & minimal', isDark: false, preview: { bg: '#F3F4F7', accent: '#4F46E5', accentPink: '#7C3AED' } },
  { name: 'ocean', label: 'Ocean', description: 'Terang, biru & cyan segar', isDark: false, preview: { bg: '#EEF6FB', accent: '#0EA5E9', accentPink: '#06B6D4' } },
  { name: 'sunset', label: 'Sunset', description: 'Terang, oranye & merah hangat', isDark: false, preview: { bg: '#FDF3EC', accent: '#F97316', accentPink: '#EF4444' } },
  { name: 'forest', label: 'Forest', description: 'Terang, hijau & lime segar', isDark: false, preview: { bg: '#F1F7EF', accent: '#16A34A', accentPink: '#84CC16' } },
];

/**
 * Default fallback SEBELUM preferensi tersimpan sempat dibaca dari storage
 * (first paint) - lihat `lib/ThemeContext.tsx` buat mekanisme ganti tema
 * sungguhan saat runtime (dipilih user di Setelan, tersimpan permanen).
 */
export const ACTIVE_THEME: ThemeName = 'pastel';
