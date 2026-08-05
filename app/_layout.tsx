import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator, AppState, AppStateStatus, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { colors } from '@/lib/theme';
import { ThemeProvider, useThemePicker } from '@/lib/ThemeContext';
import { THEME_LIST } from '@/lib/themes';

/**
 * FIX (dashboard "gak realtime"): TanStack Query punya `refetchOnWindowFocus`
 * (default ON) yang di web otomatis refetch pas tab balik aktif - tapi itu
 * jalan lewat event DOM `visibilitychange`, yang SAMA SEKALI GAK ADA di React
 * Native. Tanpa wiring manual ini, `focusManager` gak pernah tau app baru
 * balik ke foreground (mis. abis switch app / kunci-buka layar / balik dari
 * notifikasi), jadi data yang ketampil (termasuk bar CPU/RAM/Disk di
 * Dashboard) BEKU di nilai lama sampai `refetchInterval` kebetulan tick lagi
 * (bisa sampai ~15 detik lagi) atau user pull-to-refresh manual - persis
 * gejala yang dilaporkan. `AppState` dari react-native itu counterpart-nya
 * `visibilitychange` di web - begitu disambungkan ke `focusManager`, semua
 * query di app ini (bukan cuma dashboard) otomatis refetch begitu app balik
 * aktif, TANPA perlu refresh manual. Ini pola resmi yang didokumentasikan
 * TanStack Query buat React Native.
 */
function onAppStateChange(status: AppStateStatus) {
  if (Platform.OS !== 'web') {
    focusManager.setFocused(status === 'active');
  }
}

function useRefetchOnAppFocus() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { checking, configured } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (checking) return;
    const onSettingsScreen = segments.join('/').includes('settings');
    if (!configured && !onSettingsScreen) {
      router.replace('/settings');
    }
  }, [checking, configured, segments]);

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }
  return <>{children}</>;
}

/**
 * Satu-satunya komponen yang beneran subscribe ke ThemeContext lewat
 * `useThemePicker()`. React CUMA re-render otomatis komponen yang subscribe
 * context (bukan seluruh subtree di bawah Provider - itu mitos umum,
 * `children` yang dilewatkan sebagai prop tetap "bailout" kalau reference-nya
 * gak berubah). Makanya subtree beneran ("Stack" dkk) dibungkus `<View
 * key={themeName}>` di sini - ganti `key` = React UNMOUNT + MOUNT ULANG
 * seluruh subtree dari nol, jadi SEMUA screen (termasuk yang gak pernah
 * denger soal ThemeContext) dijamin baca ulang `colors.xxx` versi terbaru
 * pas fungsinya dijalankan lagi dari awal. Efek samping yang disengaja:
 * ganti tema = reset state navigasi ke initial route - dianggap wajar buat
 * aksi Setelan yang jarang dipencet, jauh lebih murah daripada refactor
 * ~30 file ke `useTheme()` hook.
 */
function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { themeName, ready } = useThemePicker();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  const meta = THEME_LIST.find((t) => t.name === themeName);
  return (
    <View key={themeName} style={{ flex: 1 }}>
      <StatusBar style={meta?.isDark ? 'light' : 'dark'} />
      {children}
    </View>
  );
}

export default function RootLayout() {
  // Bug fix: sebelumnya icon @expo/vector-icons diasumsikan auto-linking
  // fontnya jalan sendiri - kadang GAGAL kalau versi paket gak pas /
  // metro cache lama, hasilnya kotak kosong bukan icon. Sekarang font
  // Ionicons di-load EKSPLISIT lewat expo-font, dan app nunggu sampai
  // beres sebelum render apapun - dijamin ada, bukan gambling.
  // Bug fix: sebelumnya cuma destructure `fontsLoaded`, buang tuple kedua
  // (error). useFonts() balikin [loaded, error] - kalau font GAGAL load
  // (bukan cuma "belum selesai"), `loaded` tetap `false` SELAMANYA dan
  // `error` keisi, tapi karena error-nya gak pernah dicek, kondisi
  // `!fontsLoaded` di bawah tetap true terus-terusan -> app nyangkut di
  // spinner loading pas dibuka, gak pernah lanjut. Sekarang begitu ada
  // `fontError`, app tetap jalan (icon Ionicons mungkin gak muncul, tapi itu
  // kosmetik doang - jauh lebih baik daripada seluruh app gak bisa dipakai).
  const [fontsLoaded, fontError] = useFonts({ ...Ionicons.font });
  useRefetchOnAppFocus();

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    // Bug fix: SafeAreaProvider KELEWAT di versi sebelumnya - ini penyebab
    // utama tab bar/navbar "nembus" ke area status bar / gesture-nav bar
    // Android (insets gak kehitung sama sekali). Harus jadi provider
    // PALING LUAR, sebelum apapun yang pakai insets (termasuk Tabs di
    // (tabs)/_layout.tsx).
    //
    // ThemeProvider dibungkus di LUAR SafeAreaProvider - preferensi tema
    // perlu kebaca duluan sebelum apapun sempat render warna.
    <ThemeProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGate>
              <ThemedRoot>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="settings" options={{ headerShown: true, title: 'Pengaturan Koneksi', presentation: 'modal' }} />
                </Stack>
              </ThemedRoot>
            </AuthGate>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
