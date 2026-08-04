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

/** POST /db/query - SELECT-only lewat driver mysql2/pg, connection string diambil live dari Coolify tiap request. */
export async function runCompanionDbQuery(databaseUuid: string, sql: string): Promise<DbQueryResult> {
  const c = await companionClient();
  return unwrap(c.post('/db/query', { databaseUuid, sql }));
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
  projectType: CompanionProjectType;
  mode: CompanionMigrateMode;
  applicationUuid: string;
  confirmed?: boolean;
}): Promise<{ command: string }> {
  const c = await companionClient();
  return unwrap(c.post('/db/migrate', opts));
}
