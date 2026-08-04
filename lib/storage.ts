import * as SecureStore from 'expo-secure-store';

/**
 * API key & base URL VPS disimpan lewat expo-secure-store (Keystore di
 * Android) - BUKAN AsyncStorage biasa, karena API key setara password root
 * ke semua endpoint (termasuk drop database). Lihat middleware/auth.js di
 * backend: 1 key = akses penuh ke semua action yang di-expose.
 */

const KEY_BASE_URL = 'zenvps_base_url';
const KEY_API_KEY = 'zenvps_api_key';

export async function getBaseUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_BASE_URL);
}

export async function setBaseUrl(url: string): Promise<void> {
  // Buang trailing slash biar gak dobel pas digabung sama path (mis. "/database")
  const clean = url.trim().replace(/\/+$/, '');
  await SecureStore.setItemAsync(KEY_BASE_URL, clean);
}

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_API_KEY);
}

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_API_KEY, key.trim());
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_BASE_URL);
  await SecureStore.deleteItemAsync(KEY_API_KEY);
}

export async function isConfigured(): Promise<boolean> {
  const [url, key] = await Promise.all([getBaseUrl(), getApiKey()]);
  return Boolean(url && key);
}

/**
 * Kredensial SSH buat Terminal SSH native (Fase 3) - disimpan di
 * expo-secure-store juga, setara sensitif kayak API key (password/private
 * key = akses shell penuh ke server, bukan cuma endpoint API yang dibatasi).
 *
 * CATATAN size limit: SecureStore di beberapa versi Android pernah punya
 * batas ukuran per-value yang lumayan kecil - kalau private key kamu gede
 * banget (RSA 4096 PEM bisa ~3-4KB), simpannya BISA gagal di device
 * tertentu (`setSshCredentials` bakal throw). Kalau ketemu itu, coba private
 * key ED25519 (jauh lebih pendek dari RSA) atau pakai auth password aja.
 */
export type SshAuthMethod = 'password' | 'key';

export interface SshCredentials {
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

const KEY_SSH_CREDENTIALS = 'zenvps_ssh_credentials';

export async function getSshCredentials(): Promise<SshCredentials | null> {
  const raw = await SecureStore.getItemAsync(KEY_SSH_CREDENTIALS);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SshCredentials;
  } catch {
    return null;
  }
}

export async function setSshCredentials(creds: SshCredentials): Promise<void> {
  await SecureStore.setItemAsync(KEY_SSH_CREDENTIALS, JSON.stringify(creds));
}

export async function clearSshCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_SSH_CREDENTIALS);
}

export async function hasSshCredentials(): Promise<boolean> {
  return Boolean(await getSshCredentials());
}

/**
 * Kredensial Companion API (Coolify migration, Fase 4) - SENGAJA key/fungsi
 * terpisah dari zenvps_base_url/zenvps_api_key di atas, BUKAN reuse. Dua
 * backend ini independen (Bagian 3.2 dokumen migrasi): vps-manager buat VPS
 * lama, Companion API buat VPS Coolify baru - keduanya bisa aktif paralel
 * selama migrasi bertahap (PORTOFOLIO dulu, project lain belum pindah).
 */
const KEY_COMPANION_BASE_URL = 'zenvps_companion_base_url';
const KEY_COMPANION_TOKEN = 'zenvps_companion_token';

export async function getCompanionBaseUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_COMPANION_BASE_URL);
}

export async function setCompanionBaseUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  await SecureStore.setItemAsync(KEY_COMPANION_BASE_URL, clean);
}

export async function getCompanionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_COMPANION_TOKEN);
}

export async function setCompanionToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_COMPANION_TOKEN, token.trim());
}

export async function clearCompanionCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_COMPANION_BASE_URL);
  await SecureStore.deleteItemAsync(KEY_COMPANION_TOKEN);
}

export async function isCompanionConfigured(): Promise<boolean> {
  const [url, token] = await Promise.all([getCompanionBaseUrl(), getCompanionToken()]);
  return Boolean(url && token);
}

/**
 * Preferensi tema tersimpan (bukan data sensitif) - tetap dilewatkan lewat
 * expo-secure-store daripada nambah dependency AsyncStorage baru cuma buat
 * satu string kecil ini. Kalau gagal baca/tulis (device aneh, dst), caller
 * (`ThemeContext.tsx`) fallback ke tema default - bukan nge-block app.
 */
const KEY_THEME_NAME = 'zenvps_theme_name';

export async function getThemeName(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY_THEME_NAME);
}

export async function setThemeName(name: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_THEME_NAME, name);
}
