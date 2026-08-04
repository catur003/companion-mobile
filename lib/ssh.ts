import { Platform } from 'react-native';
import type { SshCredentials } from './storage';

/**
 * Wrapper tipis di atas `@marcomueglich/react-native-ssh-client` (native
 * module, ANDROID-ONLY - fork dari `react-native-ssh-sftp` lama yang udah
 * diadaptasi buat React Native New Architecture/TurboModules, karena
 * `newArchEnabled: true` di app.json). Semua pemanggilan native diisolasi
 * di sini biar:
 * 1. Layar UI (ssh-credentials.tsx, ssh-terminal.tsx) gak perlu tau detail
 *    API library pihak ketiga.
 * 2. Kalau suatu saat gantiin library (mis. iOS akhirnya kesupport, atau
 *    fork ini berhenti di-maintain - baru versi 1.0.0, masih kecil sekali
 *    komunitasnya), cuma file ini yang perlu diubah.
 *
 * WAJIB REBUILD: ini native module, BUKAN JS murni. Setelah
 * `npm install @marcomueglich/react-native-ssh-client`, HARUS
 * `npx expo prebuild` lalu build ulang lewat EAS (`npm run build:apk`) -
 * gak bisa lagi dites lewat Expo Go atau APK lama, harus install APK baru
 * hasil build. `require()` di bawah sengaja LAZY (bukan static import di
 * top-level) supaya kalau native code-nya belum ke-link, errornya baru
 * muncul pas fitur ini dipakai (dengan pesan jelas) - bukan bikin SELURUH
 * app crash pas start.
 */

let SSHClientModule: any = null;
let PtyTypeModule: any = null;

function loadNativeModule() {
  if (Platform.OS !== 'android') {
    throw new Error('Terminal SSH native cuma didukung di Android untuk saat ini.');
  }
  if (!SSHClientModule) {
    // Pakai nama PERSIS sama seperti di package.json (`@marcomueglich/...`).
    // README library ini sempet nunjukkin contoh import dari nama UNSCOPED
    // ("react-native-ssh-client") - itu SANGAT KEMUNGKINAN cuma leftover
    // dokumentasi dari library asal (`react-native-ssh-sftp`) yang belum
    // sempet diupdate pas di-fork, BUKAN cara import valid alternatif.
    // Nama import yang benar SELALU sama dengan "name" di package.json
    // package yang ke-install - itu satu-satunya sumber kebenaran, bukan
    // contoh kode di README. (Sengaja TIDAK dibikin coba-dua-nama pakai
    // try/catch di sini: Metro me-resolve `require()` dengan string literal
    // secara STATIS pas bundling, bukan runtime - kalau salah satu nama gak
    // beneran ada sebagai package ter-install, bundling-nya GAGAL DULUAN
    // sebelum try/catch sempet jalan, jadi nyoba dua nama sekaligus malah
    // nambah risiko build gagal, bukan ngurangin.)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@marcomueglich/react-native-ssh-client');
      SSHClientModule = mod.default ?? mod;
      PtyTypeModule = mod.PtyType;
    } catch {
      throw new Error(
        'Modul native SSH belum ter-link ke build ini. Pastikan sudah jalanin ' +
          '"npx expo prebuild" lalu rebuild APK lewat EAS - fitur ini gak jalan di ' +
          'Expo Go atau APK lama sebelum dependency-nya ditambahin.'
      );
    }
  }
  return { SSHClient: SSHClientModule, PtyType: PtyTypeModule };
}

export interface SshSession {
  execute(command: string): Promise<string>;
  startShell(ptyType: unknown): Promise<string>;
  writeToShell(command: string): Promise<string>;
  closeShell(): void;
  disconnect(): void;
}

/**
 * Konek ke server pakai kredensial tersimpan. `connectWithPassword` DIJAMIN
 * ada (didokumentasikan lengkap di README library). `connectWithKey` cuma
 * disebut di daftar fitur README ("SSH connection with password or private
 * key authentication") TANPA contoh kode/signature resmi - jadi di-cek
 * dulu keberadaannya secara runtime sebelum dipanggil, biar kalau ternyata
 * versi yang ke-install belum expose method itu, errornya jelas (bukan
 * "undefined is not a function" yang membingungkan).
 */
export async function connectSsh(creds: SshCredentials): Promise<SshSession> {
  const { SSHClient } = loadNativeModule();

  if (creds.authMethod === 'password') {
    if (!creds.password) throw new Error('Password kosong.');
    return SSHClient.connectWithPassword(creds.host, creds.port, creds.username, creds.password);
  }

  if (!creds.privateKey) throw new Error('Private key kosong.');
  if (typeof SSHClient.connectWithKey !== 'function') {
    throw new Error(
      'Versi library SSH yang ke-install belum expose "connectWithKey" secara terdokumentasi. ' +
        'Coba auth Password dulu, atau cek node_modules/@marcomueglich/react-native-ssh-client ' +
        'buat nama method key-auth yang benar lalu update lib/ssh.ts.'
    );
  }
  return SSHClient.connectWithKey(creds.host, creds.port, creds.username, creds.privateKey, creds.passphrase);
}

/** PTY type buat `startShell()` - dipakai biar UI gak perlu import library native langsung. */
export function getPtyTypeXterm(): unknown {
  const { PtyType } = loadNativeModule();
  return PtyType?.XTERM ?? 'xterm';
}

/**
 * Ekstrak pesan error yang bisa dibaca manusia dari APAPUN bentuknya.
 *
 * Bug fix: rejection dari native module (lewat bridge React Native) SERING
 * BUKAN instance `Error` JS biasa - biasanya berbentuk object polos kayak
 * `{ code: 'E_SSH_AUTH_FAIL', message: '...', userInfo: {...} }`, atau
 * kadang cuma string mentah. Kode UI sebelumnya (`err instanceof Error ?
 * err.message : 'pesan generik'`) nge-skip semua kasus itu dan nampilin
 * "Terjadi kesalahan tidak diketahui" - pesan ASLI dari native SSH library
 * (yang justru paling penting buat diagnosis kenapa gagal) ketelan. Sekarang
 * dicoba beberapa bentuk umum sebelum nyerah ke JSON.stringify mentah, biar
 * apapun bentuknya, ada info yang kebaca di layar.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.message === 'string' && anyErr.message) return anyErr.message;
    if (typeof anyErr.userInfo === 'object' && anyErr.userInfo) {
      const info = anyErr.userInfo as Record<string, unknown>;
      if (typeof info.message === 'string' && info.message) return info.message;
    }
    if (typeof anyErr.code === 'string' && anyErr.code) return `Kode error native: ${anyErr.code}`;
    try {
      const json = JSON.stringify(err);
      if (json && json !== '{}') return json;
    } catch {
      // circular / gak bisa di-serialize, lanjut ke fallback di bawah
    }
  }
  return 'Terjadi kesalahan tidak diketahui (bentuk error dari native module gak dikenali).';
}

/** Cek ringan tanpa nge-throw - buat nampilin banner "belum ke-install" di UI kalau perlu. */
export function isSshModuleAvailable(): boolean {
  try {
    loadNativeModule();
    return true;
  } catch {
    return false;
  }
}
