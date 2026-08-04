import axios, { AxiosInstance } from 'axios';
import { getCompanionBaseUrl, getCompanionToken } from './storage';
import { ApiError } from './api';

/**
 * Client TERPISAH dari lib/api.ts (vps-manager) - sengaja bukan reuse
 * client() yang sama, karena base URL & token beda backend total (Companion
 * API di VPS Coolify, bukan VPS lama). Lihat catatan di storage.ts.
 *
 * Endpoint yang di-wire di sini SEMUANYA sudah dites end-to-end langsung ke
 * instance nyata (bukan asumsi dari desain doang) - per 4 Agustus 2026:
 * restart-count, files (read/write), db/query, db/migrate.
 */
async function companionClient(): Promise<AxiosInstance> {
  const [baseURL, token] = await Promise.all([getCompanionBaseUrl(), getCompanionToken()]);
  if (!baseURL || !token) {
    throw new ApiError('Belum ada koneksi ke Companion API. Isi dulu di Settings.', 'COMPANION_NOT_CONFIGURED');
  }
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: { Authorization: `Bearer ${token}` },
  });
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
}

function unwrap<T>(promise: Promise<{ data: ApiEnvelope<T> }>): Promise<T> {
  return promise
    .then((res) => {
      if (!res.data.success) {
        throw new ApiError(res.data.message || 'Request gagal.', res.data.code || 'UNKNOWN');
      }
      return res.data.data as T;
    })
    .catch((err) => {
      if (err instanceof ApiError) throw err;
      if (axios.isAxiosError(err)) {
        const body = err.response?.data as ApiEnvelope<unknown> | undefined;
        throw new ApiError(
          body?.message || err.message || 'Gagal konek ke Companion API.',
          body?.code || 'NETWORK_ERROR',
          err.response?.status
        );
      }
      throw new ApiError('Terjadi kesalahan tak terduga.', 'UNKNOWN');
    });
}

export async function companionHealthCheck(baseUrl: string): Promise<boolean> {
  try {
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/health`, { timeout: 8000 });
    return Boolean(res.data?.success);
  } catch {
    return false;
  }
}

// ===================== Restart Count =====================

export interface RestartCountResult {
  ok: boolean;
  restartCount: number | null;
  restartPolicy: string;
  containerState: string;
}

/**
 * GET /applications/:uuid/restart-count - fallback kalau Coolify API sendiri
 * gak expose ini bagus. UBAH (4 Agustus 2026): pakai applicationUuid Coolify
 * (stabil), BUKAN container ID Docker mentah - container ID berubah tiap
 * redeploy, backend resolve container aktif sendiri tiap request.
 */
export async function getApplicationRestartCount(applicationUuid: string): Promise<RestartCountResult> {
  const c = await companionClient();
  return unwrap(c.get(`/applications/${encodeURIComponent(applicationUuid)}/restart-count`));
}

// ===================== File Manager =====================
// UBAH (4 Agustus 2026): "applicationUuid" (Coolify, stabil), BUKAN container
// ID Docker mentah lagi - alasan sama kayak restart-count di atas.

export async function readContainerFile(applicationUuid: string, path: string): Promise<{ content: string }> {
  const c = await companionClient();
  return unwrap(c.get('/files', { params: { applicationUuid, path } }));
}

export interface ProcessEnvEntry {
  key: string;
  value: string;
}

/**
 * GET /files/process-env - value env ASLI yang beneran aktif di proses yang
 * jalan (/proc/1/environ), BEDA dari getCoolifyApplicationEnvs (config
 * Coolify, sengaja gak pernah kirim field value - keputusan keamanan
 * mereka). Ini yang dipakai buat "lihat isi env sekarang", bukan itu.
 */
export async function getContainerProcessEnv(applicationUuid: string): Promise<ProcessEnvEntry[]> {
  const c = await companionClient();
  const result = await unwrap<{ envs: ProcessEnvEntry[] }>(c.get('/files/process-env', { params: { applicationUuid } }));
  return result.envs;
}

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
  raw: string;
}

/** GET /files/list - list isi folder, buat file explorer (gak perlu user ngetik nama file). */
export async function listContainerDirectory(applicationUuid: string, path: string): Promise<{ path: string; entries: DirectoryEntry[] }> {
  const c = await companionClient();
  return unwrap(c.get('/files/list', { params: { applicationUuid, path } }));
}

/** MENIMPA isi file di container - destruktif, backend minta confirmed:true (lihat commandPolicy.js). */
export async function writeContainerFile(applicationUuid: string, path: string, content: string): Promise<void> {
  const c = await companionClient();
  await unwrap<void>(c.put('/files', { content, confirmed: true }, { params: { applicationUuid, path } }));
}

// ===================== DB Query =====================

export interface DbQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

/**
 * POST /db/query - SELECT-only lewat driver mysql2/pg, connection string diambil live dari Coolify tiap request.
 * "schema" (BARU) - isi kalau databaseUuid ini server yang dipakai bareng
 * (numpang) beberapa project, biar query ke schema yang bener, BUKAN
 * schema default server itu (yang mungkin punya project lain).
 */
export async function runCompanionDbQuery(databaseUuid: string, sql: string, schema?: string): Promise<DbQueryResult> {
  const c = await companionClient();
  return unwrap(c.post('/db/query', { databaseUuid, sql, schema }));
}

/** GET /db/schemas - daftar nama schema/database di 1 server MySQL, buat cegah tabrakan nama & resolve project yang numpang. */
export async function listDatabaseSchemas(databaseUuid: string): Promise<string[]> {
  const c = await companionClient();
  const result = await unwrap<{ schemas: string[] }>(c.get('/db/schemas', { params: { databaseUuid } }));
  return result.schemas;
}

/**
 * POST /db/create-schema - bikin schema+user baru DI SERVER yang UDAH ADA
 * (numpang 1 mysqld, gak bikin container/server baru - hemat RAM, sama pola
 * kayak vps-manager lama). SELALU butuh confirmed:true.
 */
export async function createDatabaseSchema(opts: {
  databaseUuid: string;
  newDbName: string;
  newUser: string;
  newPassword: string;
  confirmed: boolean;
}): Promise<{ newDbName: string; newUser: string }> {
  const c = await companionClient();
  return unwrap(c.post('/db/create-schema', opts));
}

// ===================== Registered Projects =====================

export interface RegisteredCoolifyProject {
  key: string;
  name: string;
  applicationUuid: string;
  databaseUuid?: string;
  /** BARU (4 Agustus 2026): diisi kalau databaseUuid ini "numpang" 1 server MySQL bareng project lain (bukan schema default Coolify) - WAJIB diisi kalau numpang, biar query/browse gak nyasar ke schema project lain. */
  schemaName?: string;
}

/**
 * GET /projects - daftar project Coolify, dibaca Companion API dari
 * projects.json di VPS. UBAH (4 Agustus 2026): dulu di-hardcode di
 * lib/coolifyProjects.ts (array statis di kode app) - masalahnya nambah 1
 * project = wajib build ulang app mobile. Sekarang fetch dari server,
 * nambah project = edit projects.json doang, ZenVPS langsung kebaca tanpa
 * build ulang.
 */
export async function listRegisteredProjects(): Promise<RegisteredCoolifyProject[]> {
  const c = await companionClient();
  const result = await unwrap<{ projects: RegisteredCoolifyProject[] }>(c.get('/projects'));
  return result.projects;
}

/**
 * POST /projects - simpan mapping key/name/applicationUuid/databaseUuid ke
 * projects.json di VPS (4 Agustus 2026, gantiin ritual SSH+nano manual).
 * applicationUuid/databaseUuid WAJIB dipilih user dari daftar Coolify asli
 * (listCoolifyApplications/listCoolifyDatabases) - BUKAN ditebak dari nama,
 * biar gak ada resiko app ke-pasang database yang salah tanpa ketauan.
 */
export async function upsertRegisteredProject(entry: RegisteredCoolifyProject): Promise<RegisteredCoolifyProject[]> {
  const c = await companionClient();
  const result = await unwrap<{ projects: RegisteredCoolifyProject[] }>(c.post('/projects', entry));
  return result.projects;
}

export async function deleteRegisteredProject(key: string): Promise<RegisteredCoolifyProject[]> {
  const c = await companionClient();
  const result = await unwrap<{ projects: RegisteredCoolifyProject[] }>(c.delete(`/projects/${encodeURIComponent(key)}`));
  return result.projects;
}

/**
 * POST /db/reset-password - SENGAJA endpoint sempit, cuma bisa ALTER USER
 * (ganti password), BUKAN mutation umum. Username-nya otomatis diambil dari
 * connection string Coolify sendiri (bukan user yang nentuin) - user cuma
 * kasih password baru. SELALU butuh confirmed:true - ganti password
 * disconnect semua koneksi yang masih pakai password lama.
 */
export async function resetDatabasePassword(
  databaseUuid: string,
  newPassword: string,
  confirmed: boolean
): Promise<{ username: string }> {
  const c = await companionClient();
  return unwrap(c.post('/db/reset-password', { databaseUuid, newPassword, confirmed }));
}

// ===================== DB Migrate (Prisma push/seed dst) =====================

export type CompanionProjectType = 'nextjs-prisma' | 'laravel';
export type CompanionMigrateMode = 'generate' | 'push' | 'push_force' | 'migrate' | 'seed' | 'migrate_force';

/**
 * POST /db/migrate - generate command + kirim ke field Post-deployment Coolify
 * lewat PATCH /api/v1/applications/{uuid}. Mode "push_force"/"seed" butuh
 * confirmed:true (lihat commandPolicy.js, confirmRequired) - konfirmasi ASLI
 * (Alert/AppModal) wajib dilakukan di layar pemanggil SEBELUM fungsi ini
 * dipanggil, sama seperti pola destruktif lain di lib/api.ts.
 */
export async function runCompanionDbMigrate(opts: {
  projectType?: CompanionProjectType;
  mode?: CompanionMigrateMode;
  applicationUuid: string;
  confirmed?: boolean;
  /** Kalau diisi, dipakai APA ADANYA (skip generateCommand) - buat gabung command (push && seed) atau fix runner yang gak cocok (.ts vs .js). */
  customCommand?: string;
}): Promise<{ command: string }> {
  const c = await companionClient();
  return unwrap(c.post('/db/migrate', opts));
}
