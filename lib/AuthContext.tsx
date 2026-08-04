import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { isConfigured } from './storage';

interface AuthContextValue {
  /** Lagi ngecek SecureStore pertama kali app dibuka (splash/loading). */
  checking: boolean;
  /** Base URL + API Key sudah tersimpan & valid. */
  configured: boolean;
  /**
   * Panggil ini abis berhasil Simpan/Hapus koneksi di Settings, biar
   * AuthGate langsung tahu status terbaru TANPA perlu restart app.
   *
   * Bug fix: sebelumnya `configured` cuma dicek SEKALI pas RootLayout
   * mount (`useEffect(() => {...}, [])`), disimpan di state lokal
   * `_layout.tsx` yang gak bisa diakses dari `SettingsForm.tsx`. Abis user
   * Simpan, SecureStore-nya kesimpan bener, tapi state `configured` di
   * AuthGate tetap `false` (stale) - efek sampingnya: segments berubah ke
   * "(tabs)", effect kedua AuthGate lihat `!configured` masih true, terus
   * nge-bounce user balik ke /settings lagi. User ngerasa "harus restart
   * app dulu baru bisa" karena restart = AuthGate mount ulang dari nol =
   * `isConfigured()` kebaca ulang & dapet nilai bener. Sekarang
   * `SettingsForm` manggil `refresh()` ini abis Simpan/Hapus, jadi state-nya
   * update di tempat, gak perlu restart.
   */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [configured, setConfigured] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const ok = await isConfigured();
      setConfigured(ok);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setChecking(false));
  }, [refresh]);

  return <AuthContext.Provider value={{ checking, configured, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() harus dipanggil di dalam <AuthProvider>');
  }
  return ctx;
}
