import { createContext, useCallback, useContext, useEffect, useMemo, useState, PropsWithChildren } from 'react';
import { themes, ThemeName, ACTIVE_THEME } from './themes';
import { colors } from './theme';
import { getThemeName, setThemeName as persistThemeName } from './storage';

interface ThemeContextValue {
  /** Nama tema aktif saat ini - dipakai buat highlight pilihan di picker. */
  themeName: ThemeName;
  /** Ganti tema secara global: mutate `colors` singleton + trigger re-render + simpan ke storage. */
  setTheme: (name: ThemeName) => void;
  /** false selama preferensi tersimpan belum sempat dibaca (first paint pakai default). */
  ready: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  themeName: ACTIVE_THEME,
  setTheme: () => {},
  ready: false,
});

/**
 * Provider ganti tema global. Ditaruh di `app/_layout.tsx`, PALING LUAR
 * (sebelum apapun yang render warna) - lihat komentar di `theme.ts` buat
 * penjelasan lengkap kenapa mutate object singleton dipilih ketimbang
 * refactor semua komponen ke hook.
 */
export function ThemeProvider({ children }: PropsWithChildren) {
  const [themeName, setThemeNameState] = useState<ThemeName>(ACTIVE_THEME);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getThemeName()
      .then((stored) => {
        const isValid = stored && Object.prototype.hasOwnProperty.call(themes, stored);
        const resolved = (isValid ? stored : ACTIVE_THEME) as ThemeName;
        if (resolved !== ACTIVE_THEME) {
          Object.assign(colors, themes[resolved]);
        }
        setThemeNameState(resolved);
      })
      .catch(() => {
        // Gagal baca storage (device aneh, dst) - diam-diam pakai default,
        // gak perlu ganggu user dengan error buat hal sekosmetik ini.
      })
      .finally(() => setReady(true));
  }, []);

  const setTheme = useCallback((name: ThemeName) => {
    if (!themes[name]) return;
    Object.assign(colors, themes[name]);
    setThemeNameState(name);
    persistThemeName(name).catch(() => {
      // Perubahan tetap kepakai di sesi ini walau gagal tersimpan permanen -
      // gak nge-block ganti tema cuma karena storage error.
    });
  }, []);

  const value = useMemo(() => ({ themeName, setTheme, ready }), [themeName, setTheme, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePicker() {
  return useContext(ThemeContext);
}
