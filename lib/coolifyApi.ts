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

// ===================== Create App (Deploy Baru) =====================
// Sumber: dokumentasi resmi Coolify (coolify.io/docs/api-reference), BUKAN
// dari komunitas/tebakan - tapi endpoint create ini SENDIRI belum pernah
// dites ke instance nyata kamu (beda dari start/stop/restart yang udah
// confirmed). Wajib dites ke 1 app kecil dulu, jangan langsung project besar.

export interface CoolifyProjectSummary {
  id: number;
  uuid: string;
  name: string;
  description?: string;
}

export async function listCoolifyProjects(): Promise<CoolifyProjectSummary[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get('/projects');
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar project Coolify.');
  }
}

export interface CoolifyServerSummary {
  uuid: string;
  name: string;
  [key: string]: unknown;
}

export async function listCoolifyServers(): Promise<CoolifyServerSummary[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get('/servers');
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar server Coolify.');
  }
}

export interface CreatePublicApplicationPayload {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  git_repository: string;
  git_branch: string;
  build_pack: 'nixpacks' | 'static' | 'dockerfile' | 'dockercompose';
  ports_exposes: string;
  name?: string;
  base_directory?: string;
  domains?: string;
}

export async function createCoolifyPublicApplication(
  payload: CreatePublicApplicationPayload
): Promise<{ uuid: string }> {
  const c = await coolifyClient();
  try {
    const res = await c.post('/applications/public', payload);
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal bikin application baru di Coolify.');
  }
}

// ===================== Private Repo (GitHub App) =====================

export interface CoolifyGithubApp {
  uuid: string;
  name: string;
  [key: string]: unknown;
}

export async function listCoolifyGithubApps(): Promise<CoolifyGithubApp[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get('/github-apps');
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar GitHub App di Coolify.');
  }
}

export interface CreatePrivateGithubAppPayload {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  github_app_uuid: string;
  /** Format "owner/repo" (BUKAN URL lengkap) - beda dari applications/public yang minta URL penuh. */
  git_repository: string;
  git_branch: string;
  build_pack: 'nixpacks' | 'static' | 'dockerfile' | 'dockercompose';
  ports_exposes: string;
  name?: string;
  base_directory?: string;
  domains?: string;
}

/**
 * BELUM DIVERIFIKASI ke instance nyata, PLUS ada bug yang dilaporkan komunitas
 * Coolify (GitHub issue #4864, #3209): github_app_uuid dari GET /github-apps
 * KADANG beda dari UUID yang diterima endpoint create ("Github App not
 * found" walau UUID-nya bener dari listing). Kalau kejadian, workaround yang
 * dilaporkan orang lain: ambil UUID dari URL dashboard Coolify pas buka
 * halaman GitHub App itu (Settings > Source), bukan dari response API.
 */
export async function createCoolifyPrivateGithubApplication(
  payload: CreatePrivateGithubAppPayload
): Promise<{ uuid: string }> {
  const c = await coolifyClient();
  try {
    const res = await c.post('/applications/private-github-app', payload);
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal bikin application (private repo) di Coolify.');
  }
}

/**
 * Bulk-set env vars setelah app dibuat. Coolify gak terima raw .env blob
 * lewat endpoint create - wajib array {key, value}, jadi parsing dari
 * textarea dilakukan di layar pemanggil (coolify-new.tsx), bukan di sini.
 *
 * PALING GAK PASTI dari semua fungsi baru di file ini - payload key "envs"
 * diambil dari 1 referensi implementasi pihak ketiga (MCP wrapper), BUKAN
 * dari OpenAPI spec resmi Coolify yang saya baca lengkap. Kalau gagal
 * dengan pesan error soal format body, ini yang pertama dicurigai salah.
 */
export async function setCoolifyApplicationEnvsBulk(
  applicationUuid: string,
  envs: { key: string; value: string }[]
): Promise<void> {
  if (envs.length === 0) return;
  const c = await coolifyClient();
  try {
    await c.patch(`/applications/${encodeURIComponent(applicationUuid)}/envs/bulk`, { envs });
  } catch (err) {
    throw toApiError(err, 'App berhasil dibuat, tapi gagal set environment variables.');
  }
}
