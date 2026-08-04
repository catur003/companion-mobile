import axios, { AxiosInstance } from 'axios';
import { getCoolifyBaseUrl, getCoolifyToken } from './storage';
import { ApiError } from './api';

/**
 * Client TERPISAH lagi - manggil Coolify /api/v1 langsung, BUKAN lewat
 * Companion API. Ini jalur paralel yang dimaksud Bagian 3.2 dokumen: Coolify
 * pegang deploy/start/stop/restart/status (yang udah dia kuasai native),
 * Companion API cuma nutup 4 gap kecil (restart-count fallback, file
 * manager, db query, db migrate command).
 */
async function coolifyClient(): Promise<AxiosInstance> {
  const [baseURL, token] = await Promise.all([getCoolifyBaseUrl(), getCoolifyToken()]);
  if (!baseURL || !token) {
    throw new ApiError('Belum ada koneksi ke Coolify API. Isi dulu di Settings.', 'COOLIFY_NOT_CONFIGURED');
  }
  return axios.create({
    baseURL: `${baseURL}/api/v1`,
    timeout: 20000,
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * PENTING - beda dari lib/companionApi.ts: Coolify API TIDAK selalu bungkus
 * response-nya jadi {success, message, data} kayak Companion API/vps-manager
 * (itu konvensi kita sendiri). Coolify balikin JSON mentah objek resource
 * langsung. Jadi TIDAK ada unwrap() generik di sini - tiap fungsi baca
 * response.data apa adanya.
 */

export interface CoolifyApplication {
  uuid: string;
  name: string;
  // TODO belum diverifikasi ke instance nyata: field status di Coolify API
  // BISA jadi bukan string simple "running"/"stopped" - kemungkinan format
  // "running:healthy" atau field terpisah (mis. "status" vs "health_check").
  // Tes GET dulu sebelum percaya field ini match StatusPill kita.
  status?: string;
  fqdn?: string | null;
  [key: string]: unknown;
}

export async function getCoolifyApplication(applicationUuid: string): Promise<CoolifyApplication> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/applications/${encodeURIComponent(applicationUuid)}`);
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal ambil status aplikasi dari Coolify.');
  }
}

/**
 * BELUM DIVERIFIKASI ke instance nyata (beda dari post_deployment_command
 * yang udah confirmed via GET+PATCH). Endpoint & method di bawah diambil
 * dari dokumentasi resmi Coolify (POST /api/v1/applications/{uuid}/start
 * dst, konvensi v4.2: state-changing endpoint wajib POST, GET balas 405).
 * WAJIB dites ke PORTOFOLIO dulu (bukan app production) sebelum dipakai
 * beneran - kalau gagal, pesan errornya bakal muncul jelas (lihat toApiError),
 * bukan pura-pura sukses.
 */
export async function startCoolifyApplication(applicationUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.post(`/applications/${encodeURIComponent(applicationUuid)}/start`);
  } catch (err) {
    throw toApiError(err, 'Gagal start/deploy aplikasi di Coolify.');
  }
}

export async function stopCoolifyApplication(applicationUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.post(`/applications/${encodeURIComponent(applicationUuid)}/stop`);
  } catch (err) {
    throw toApiError(err, 'Gagal stop aplikasi di Coolify.');
  }
}

export async function restartCoolifyApplication(applicationUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.post(`/applications/${encodeURIComponent(applicationUuid)}/restart`);
  } catch (err) {
    throw toApiError(err, 'Gagal restart aplikasi di Coolify.');
  }
}

function toApiError(err: unknown, fallbackMessage: string): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { message?: string } | undefined;
    return new ApiError(body?.message || err.message || fallbackMessage, 'COOLIFY_API_ERROR', err.response?.status);
  }
  return new ApiError(fallbackMessage, 'UNKNOWN');
}

export async function coolifyHealthCheck(baseUrl: string, token: string): Promise<boolean> {
  try {
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/api/v1/applications`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
    return Array.isArray(res.data);
  } catch {
    return false;
  }
}
