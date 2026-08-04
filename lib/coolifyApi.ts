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

/** GET /applications - daftar SEMUA app Coolify (buat picker "Kelola Mapping Project", bukan buat CoolifyAppCard yang butuh 1 app spesifik). */
export async function listCoolifyApplications(): Promise<CoolifyApplication[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get('/applications');
    return res.data ?? [];
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar application dari Coolify.');
  }
}

export interface CoolifyDatabaseSummary {
  uuid: string;
  name: string;
  database_type?: string;
  [key: string]: unknown;
}

/** GET /databases - daftar SEMUA database Coolify (semua tipe), buat picker. */
export async function listCoolifyDatabases(): Promise<CoolifyDatabaseSummary[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get('/databases');
    return res.data ?? [];
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar database dari Coolify.');
  }
}

/**
 * CONFIRMED dari dokumentasi resmi (belum dites ke instance nyata): log
 * RUNTIME container (stdout/stderr app yang lagi jalan), historis - bukan
 * live-stream. Beda dari log proses BUILD/deploy (npm install, next build,
 * dst) yang Coolify simpen di record deployment terpisah (ada endpoint
 * /deployments juga, belum di-wire di sini - baru runtime logs dulu, itu
 * yang paling sering dibutuhin buat debug app yang lagi jalan).
 */
export interface CoolifyDeploymentSummary {
  deployment_uuid: string;
  application_uuid: string | null; // extracted dari deployment_url, BUKAN field application_uuid asli (itu selalu null - lihat REALTIME-DEPLOY-LOG.md 3.4a)
  application_name: string;
  status: string;
  deployment_url: string;
  id: number; // dipakai buat nentuin mana yang "paling baru" kalau ada >1 match aktif
}

/**
 * CONFIRMED via curl langsung ke instance produksi (5 Agustus 2026, lihat
 * REALTIME-DEPLOY-LOG.md Bagian 3.4a) - GET /deployments balikin ARRAY
 * LANGSUNG (bukan {data:[...]}). Field "application_id" itu ID numerik
 * internal, BUKAN applicationUuid - dan field "application_uuid" SELALU
 * null. Satu-satunya cara reliable dapetin applicationUuid: extract dari
 * path "deployment_url" (".../application/{uuid}/deployment/...").
 */
function extractApplicationUuidFromDeploymentUrl(url: string): string | null {
  const match = url.match(/\/application\/([a-z0-9]+)\/deployment\//i);
  return match ? match[1] : null;
}

const ACTIVE_DEPLOYMENT_STATUSES = ['in_progress', 'queued'];

export async function listActiveDeployments(): Promise<CoolifyDeploymentSummary[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get('/deployments');
    const raw = Array.isArray(res.data) ? res.data : [];
    return raw
      .map((d: Record<string, unknown>) => ({
        deployment_uuid: String(d.deployment_uuid),
        application_uuid: extractApplicationUuidFromDeploymentUrl(String(d.deployment_url ?? '')),
        application_name: String(d.application_name ?? ''),
        status: String(d.status ?? ''),
        deployment_url: String(d.deployment_url ?? ''),
        id: Number(d.id ?? 0),
      }))
      // FIX (5 Agustus 2026, bug nyata: badge "Deploy..." nyangkut terus):
      // SEBELUMNYA gak ada filter status di sini sama sekali - percaya
      // buta endpoint /deployments cuma ngasih yang aktif. Ternyata
      // deployment yang udah "finished" JUGA ikut muncul di list yang sama
      // (kebukti dari observasi tes curl sebelumnya). Filter eksplisit di
      // sini, jangan percaya endpoint doang.
      .filter((d) => ACTIVE_DEPLOYMENT_STATUSES.includes(d.status));
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar deployment dari Coolify.');
  }
}

/**
 * Cari deployment aktif buat 1 app. FIX: kalau ada LEBIH DARI 1 match (edge
 * case, harusnya jarang), ambil yang "id" numeriknya PALING BESAR (paling
 * baru) - bukan asal .find() pertama ketemu, karena urutan array dari API
 * gak dijamin newest-first.
 */
export async function findActiveDeploymentForApp(applicationUuid: string): Promise<CoolifyDeploymentSummary | null> {
  const all = await listActiveDeployments();
  const matches = all.filter((d) => d.application_uuid === applicationUuid);
  if (matches.length === 0) return null;
  return matches.reduce((newest, d) => (d.id > newest.id ? d : newest));
}

export interface DeploymentLogStep {
  command: string | null;
  output: string;
  type: 'stdout' | 'stderr';
  timestamp: string;
  hidden: boolean;
  batch: number;
}

export interface DeploymentDetail {
  status: string;
  steps: DeploymentLogStep[];
}

/**
 * GET /deployments/{uuid} - endpoint SPESIFIK (1 objek, ringan), ini yang
 * di-POLLING tiap 1-2 detik, BUKAN listActiveDeployments (itu daftar umum,
 * cuma dipanggil sekali buat nemuin deployment_uuid yang aktif).
 *
 * Field "order" per-step yang diasumsikan draft awal TIDAK ADA (confirmed
 * via curl) - render incremental pakai posisi index array di layar
 * pemanggil, bukan field ini.
 */
export async function getDeploymentDetail(deploymentUuid: string): Promise<DeploymentDetail> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/deployments/${encodeURIComponent(deploymentUuid)}`);
    const logsRaw = res.data?.logs;
    let steps: DeploymentLogStep[] = [];
    if (typeof logsRaw === 'string') {
      try {
        steps = JSON.parse(logsRaw);
      } catch {
        steps = [];
      }
    }
    return { status: String(res.data?.status ?? ''), steps };
  } catch (err) {
    throw toApiError(err, 'Gagal ambil detail deployment dari Coolify.');
  }
}

/**
 * CONFIRMED (5 Agustus 2026, curl langsung): endpoint ini ASYNC - cuma
 * balikin {"message": "Validation started."}, TIDAK ADA hasil ssh_ok/
 * docker_ok instan kayak yang saya asumsikan sebelumnya. Ini cuma nge-
 * TRIGGER validasi (job background), gak ada cara ambil hasilnya lewat API
 * yang udah kecek. Fungsi ini sekarang jujur cuma "trigger", bukan
 * "cek status" - UI pemanggil WAJIB kasih tau user buat cek hasilnya di
 * dashboard Coolify, bukan pura-pura nampilin status inline.
 */
export async function triggerServerValidate(serverUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.get(`/servers/${encodeURIComponent(serverUuid)}/validate`);
  } catch (err) {
    throw toApiError(err, 'Gagal trigger validasi server Coolify.');
  }
}

export interface CoolifyServerResource {
  uuid: string;
  name: string;
  type?: string;
  status?: string;
  [key: string]: unknown;
}

/** GET /servers/{uuid}/resources - semua app/db/service di server itu + status. */
export async function getServerResources(serverUuid: string): Promise<CoolifyServerResource[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/servers/${encodeURIComponent(serverUuid)}/resources`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar resource server Coolify.');
  }
}

/**
 * CONFIRMED (5 Agustus 2026, curl langsung): shape aslinya array of
 * {ip, domains: [...]} - satu entry per IP server, "domains" isinya array
 * FQDN string. Flatten semua entry jadi 1 list flat.
 */
export async function getServerDomains(serverUuid: string): Promise<string[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/servers/${encodeURIComponent(serverUuid)}/domains`);
    const raw = Array.isArray(res.data) ? res.data : [];
    const flat: string[] = [];
    for (const entry of raw) {
      if (entry && typeof entry === 'object' && Array.isArray((entry as { domains?: unknown }).domains)) {
        flat.push(...(entry as { domains: string[] }).domains);
      }
    }
    return flat;
  } catch (err) {
    throw toApiError(err, 'Gagal ambil daftar domain server Coolify.');
  }
}

export async function getCoolifyApplicationLogs(applicationUuid: string, lines = 200): Promise<string> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/applications/${encodeURIComponent(applicationUuid)}/logs`, { params: { lines } });
    return res.data?.logs ?? '';
  } catch (err) {
    throw toApiError(err, 'Gagal ambil log aplikasi dari Coolify.');
  }
}

export interface CoolifyEnv {
  uuid?: string;
  key: string;
  value: string;
  [key: string]: unknown;
}

/** GET /applications/{uuid}/envs - belum divalidasi field exact-nya (dokumentasi cuma bilang "all environment variables", gak kasih schema detail), tapi "key"/"value" cukup pasti karena konsisten sama bulk update yang udah confirmed. */
export async function getCoolifyApplicationEnvs(applicationUuid: string): Promise<CoolifyEnv[]> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/applications/${encodeURIComponent(applicationUuid)}/envs`);
    return res.data ?? [];
  } catch (err) {
    throw toApiError(err, 'Gagal ambil environment variables dari Coolify.');
  }
}

/**
 * Log PROSES BUILD/DEPLOY (npm install, next build, dst) - beda dari
 * getCoolifyApplicationLogs (itu runtime stdout/stderr app yang lagi jalan).
 * BELUM DIVERIFIKASI: field yang isinya log text belum confirmed namanya
 * persis apa di response Coolify (kemungkinan "logs" sama kayak endpoint
 * runtime, tapi bisa juga beda struktur/array of lines) - makanya fungsi ini
 * balikin objek MENTAH apa adanya, biar UI bisa nampilin defensif (coba
 * beberapa kemungkinan field, fallback JSON.stringify kalau gak ketemu).
 */
export async function getCoolifyDeployment(deploymentUuid: string): Promise<Record<string, unknown>> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/deployments/${encodeURIComponent(deploymentUuid)}`);
    return res.data ?? {};
  } catch (err) {
    throw toApiError(err, 'Gagal ambil detail deployment dari Coolify.');
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
 *
 * Response kemungkinan besar isinya deployment_uuid (dipakai buat lihat log
 * build-nya, lihat getCoolifyDeployment di bawah) - belum confirmed field
 * exact-nya, jadi dibaca defensif (optional).
 */
export async function startCoolifyApplication(applicationUuid: string): Promise<{ deployment_uuid?: string }> {
  const c = await coolifyClient();
  try {
    const res = await c.post(`/applications/${encodeURIComponent(applicationUuid)}/start`);
    return res.data ?? {};
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

export async function restartCoolifyApplication(applicationUuid: string): Promise<{ deployment_uuid?: string }> {
  const c = await coolifyClient();
  try {
    const res = await c.post(`/applications/${encodeURIComponent(applicationUuid)}/restart`);
    return res.data ?? {};
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

/**
 * BELUM DIVERIFIKASI ke instance nyata - pola endpoint sama kayak application
 * (POST /databases/{uuid}/start|stop|restart), dikonfirmasi dari dokumentasi
 * (DeepWiki, berdasar source code Coolify). Confidence lumayan tinggi karena
 * konsisten sama pola application yang udah tested, tapi tetap belum dicoba.
 */
export interface CoolifyDatabase {
  uuid: string;
  name: string;
  status?: string;
  database_type?: string;
  [key: string]: unknown;
}

export async function getCoolifyDatabaseDetail(databaseUuid: string): Promise<CoolifyDatabase> {
  const c = await coolifyClient();
  try {
    const res = await c.get(`/databases/${encodeURIComponent(databaseUuid)}`);
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal ambil status database dari Coolify.');
  }
}

export async function startCoolifyDatabase(databaseUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.post(`/databases/${encodeURIComponent(databaseUuid)}/start`);
  } catch (err) {
    throw toApiError(err, 'Gagal start database di Coolify.');
  }
}

export async function stopCoolifyDatabase(databaseUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.post(`/databases/${encodeURIComponent(databaseUuid)}/stop`);
  } catch (err) {
    throw toApiError(err, 'Gagal stop database di Coolify.');
  }
}

export async function restartCoolifyDatabase(databaseUuid: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.post(`/databases/${encodeURIComponent(databaseUuid)}/restart`);
  } catch (err) {
    throw toApiError(err, 'Gagal restart database di Coolify.');
  }
}

/**
 * PATCH /applications/{uuid} - ganti domain (SSL Let's Encrypt otomatis
 * ngikutin, sama kayak yang kita lakuin manual buat PORTOFOLIO/web-desa,
 * cuma sekarang trigger dari app). Pakai prefix https:// biar SSL aktif.
 */
export async function updateCoolifyApplicationDomain(applicationUuid: string, domains: string): Promise<void> {
  const c = await coolifyClient();
  try {
    await c.patch(`/applications/${encodeURIComponent(applicationUuid)}`, { domains });
  } catch (err) {
    throw toApiError(err, 'Gagal update domain aplikasi di Coolify.');
  }
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

// ===================== Create Database =====================
// Sumber: dokumentasi resmi Coolify. SETIAP tipe DB (mysql/postgresql/dst)
// punya endpoint create TERPISAH & field spesifik (beda dari applications
// yang cukup 1 field "build_pack" buat bedain) - jadi didesain 1 fungsi per
// tipe dari awal, BUKAN 1 fungsi generik yang nebak-nebak field. Nambah tipe
// baru nanti = nambah 1 interface + 1 fungsi baru persis pola ini, TIDAK
// mengubah createCoolifyMysqlDatabase yang udah ada/jalan.

export interface CreateMysqlDatabasePayload {
  project_uuid: string;
  server_uuid: string;
  environment_name: string;
  name?: string;
  mysql_database?: string;
  mysql_user?: string;
  /** Kosongin biar Coolify generate sendiri (lebih aman - lihat DEPLOYMENT-NOTES.md soal password gak bisa diedit lewat form setelah container start). */
  mysql_password?: string;
  mysql_root_password?: string;
  is_public?: boolean;
  public_port?: number;
  instant_deploy?: boolean;
}

/** BELUM DIVERIFIKASI ke instance nyata - field schema dari dokumentasi resmi Coolify, endpoint create baru pertama kali dites lewat aplikasi kemarin (beda resource, sama pola). */
export async function createCoolifyMysqlDatabase(payload: CreateMysqlDatabasePayload): Promise<{ uuid: string }> {
  const c = await coolifyClient();
  try {
    const res = await c.post('/databases/mysql', payload);
    return res.data;
  } catch (err) {
    throw toApiError(err, 'Gagal bikin database MySQL di Coolify.');
  }
}

/**
 * Bulk-set env vars setelah app dibuat. Coolify gak terima raw .env blob
 * lewat endpoint create - wajib array {key, value}, jadi parsing dari
 * textarea dilakukan di layar pemanggil (coolify-new.tsx), bukan di sini.
 *
 * CONFIRMED via error nyata (4 Agustus 2026): payload key yang bener "data",
 * BUKAN "envs" (percobaan pertama gagal persis "data is required" - sesuai
 * peringatan yang udah ditulis di sini sebelumnya, referensi pihak ketiga
 * yang dipakai ternyata salah).
 */
export async function setCoolifyApplicationEnvsBulk(
  applicationUuid: string,
  envs: { key: string; value: string }[]
): Promise<void> {
  if (envs.length === 0) return;
  const c = await coolifyClient();
  try {
    await c.patch(`/applications/${encodeURIComponent(applicationUuid)}/envs/bulk`, { data: envs });
  } catch (err) {
    throw toApiError(err, 'App berhasil dibuat, tapi gagal set environment variables.');
  }
}
