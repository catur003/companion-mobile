import { Platform } from 'react-native';

/**
 * Wrapper tipis di atas `expo-notifications` - BELUM ada di package.json,
 * WAJIB jalanin `npx expo install expo-notifications` dulu (auto-resolve
 * versi yang cocok buat Expo SDK yang dipakai app ini, JANGAN `npm install`
 * manual/tebak versi). Sama kayak modul SSH native, ini juga native module -
 * perlu `npx expo prebuild` + rebuild APK lewat EAS, gak jalan di Expo Go.
 *
 * `require()` LAZY (bukan static import top-level) - pola sama kayak
 * lib/ssh.ts - biar kalau dependency-nya belum ke-install, errornya baru
 * muncul pas fitur ini dipakai (pesan jelas), bukan bikin SELURUH app
 * crash pas start.
 */
function loadNotifications() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications');
  } catch {
    throw new Error(
      'Modul expo-notifications belum ter-install. Jalanin "npx expo install expo-notifications", ' +
        '"npx expo prebuild", lalu rebuild APK lewat EAS.'
    );
  }
}

export interface PushRegistrationResult {
  ok: boolean;
  token?: string;
  errorMessage?: string;
}

/**
 * Minta izin notifikasi (kalau belum), lalu ambil Expo push token device
 * ini. Token ini yang dikirim ke Companion API (POST /push-token) buat
 * disimpen di VPS, dipakai relay notifikasi dari webhook Coolify.
 */
export async function requestPushPermissionAndGetToken(): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return { ok: false, errorMessage: 'Push notification gak didukung di web.' };
  }

  let Notifications: any;
  try {
    Notifications = loadNotifications();
  } catch (err) {
    return { ok: false, errorMessage: err instanceof Error ? err.message : String(err) };
  }

  try {
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
    }
    if (finalStatus !== 'granted') {
      return { ok: false, errorMessage: 'Izin notifikasi ditolak. Aktifkan manual lewat Setelan Android buat app ini.' };
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync();
    return { ok: true, token: tokenResult.data };
  } catch (err) {
    return {
      ok: false,
      errorMessage:
        err instanceof Error
          ? err.message
          : 'Gagal ambil push token - pastikan app ini build APK asli (bukan Expo Go) dan project ID EAS udah bener.',
    };
  }
}
