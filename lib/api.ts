import axios, { AxiosInstance } from 'axios';
import { getApiKey, getBaseUrl } from './storage';

/**
 * Satu client axios, base URL & API key diambil fresh dari SecureStore tiap
 * request (bukan di-cache di module scope) - biar begitu user ganti VPS/API
 * key di Settings, request BERIKUTNYA langsung kepakai tanpa perlu restart app.
 */
async function client(): Promise<AxiosInstance> {
  const [baseURL, apiKey] = await Promise.all([getBaseUrl(), getApiKey()]);
  if (!baseURL || !apiKey) {
    throw new ApiError('Belum ada koneksi ke VPS. Isi dulu di Settings.', 'NOT_CONFIGURED');
  }
  return axios.create({
    baseURL,
    timeout: 15000,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export class ApiError extends Error {
  code: string;
  status?: number;
  constructor(message: string, code: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
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
          body?.message || err.message || 'Gagal konek ke server.',
          body?.code || 'NETWORK_ERROR',
          err.response?.status
        );
      }
      throw new ApiError('Terjadi kesalahan tak terduga.', 'UNKNOWN');
    });
}

interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  code?: string;
  data?: T;
}

// ===================== Monitor =====================

export interface MonitorStatus {
  cpuPercent: number | null;
  ram: { totalMB: number; usedMB: number; availableMB: number; percent: number } | null;
  swap: { totalMB: number; usedMB: number; freeMB: number; percent: number } | null;
  disk: { total: string; used: string; available: string; percent: number } | null;
  uptime: string | null;
  loadAverage: { '1min': string; '5min': string; '15min': string } | null;
}

export async function getMonitorStatus(): Promise<MonitorStatus> {
  const c = await client();
  return unwrap(c.get('/monitor'));
}

// ===================== Database =====================

export interface DatabaseListResult {
  databases: string[];
}

export async function listDatabases(): Promise<DatabaseListResult> {
  const c = await client();
  return unwrap(c.get('/database'));
}

export interface CreateDatabaseResult {
  dbName: string;
  dbUser: string;
  password: string;
  connectionUrl: string;
}

export async function createDatabase(
  dbName: string,
  dbUser: string,
  password?: string
): Promise<CreateDatabaseResult> {
  const c = await client();
  return unwrap(c.post('/database', { dbName, dbUser, password }));
}

export async function listTables(dbName: string): Promise<{ dbName: string; tables: string[] }> {
  const c = await client();
  return unwrap(c.get(`/database/${encodeURIComponent(dbName)}/tables`));
}

export interface TableColumn {
  field: string;
  type: string;
  nullable: string;
  key: string;
  default: string;
  extra: string;
}

export async function describeTable(
  dbName: string,
  tableName: string
): Promise<{ dbName: string; tableName: string; columns: TableColumn[] }> {
  const c = await client();
  return unwrap(c.get(`/database/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/describe`));
}

export async function countRows(
  dbName: string,
  tableName: string
): Promise<{ dbName: string; tableName: string; total: number }> {
  const c = await client();
  return unwrap(c.get(`/database/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/count`));
}

export interface PreviewField {
  key: string;
  value: string;
}

export async function previewTable(
  dbName: string,
  tableName: string
): Promise<{ dbName: string; tableName: string; rows: PreviewField[][] }> {
  const c = await client();
  return unwrap(c.get(`/database/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/preview`));
}

export async function resetDatabasePassword(
  dbName: string,
  dbUser: string,
  password?: string
): Promise<CreateDatabaseResult> {
  const c = await client();
  return unwrap(c.post(`/database/${encodeURIComponent(dbName)}/reset-password`, { dbUser, password }));
}

export async function dropDatabase(dbName: string, dbUser?: string): Promise<void> {
  const c = await client();
  return unwrap(
    c.delete(`/database/${encodeURIComponent(dbName)}`, {
      data: { dbUser, confirm: true },
    })
  );
}

/** Tes koneksi MySQL pakai kredensial root dari Configuration. Read-only (`SELECT 1;`). */
export async function testDatabaseConnection(): Promise<void> {
  const c = await client();
  await unwrap<void>(c.get('/database/test-connection'));
}

/** Tes koneksi pakai kredensial spesifik satu database (bukan root) - buat validasi sebelum simpan/import. Read-only. */
export async function testDatabaseCredentials(dbName: string, dbUser: string, password?: string): Promise<void> {
  const c = await client();
  await unwrap<void>(c.post('/database/test-credentials', { dbName, dbUser, password }));
}

// ===================== PM2 (baru dipakai buat list read-only di Dashboard - Fase A) =====================

export interface Pm2App {
  name: string;
  owner: string;
  status: string;
  pid: number | string;
  port: number | string;
  ram: string;
  cpu: string;
  uptime: string;
  cwd: string;
  restartCount: number;
}

export async function listPm2Apps(): Promise<{ apps: Pm2App[]; warnings: string[] }> {
  const c = await client();
  return unwrap(c.get('/pm2'));
}

export async function startPm2App(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/pm2/${encodeURIComponent(name)}/start`));
}

export async function stopPm2App(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/pm2/${encodeURIComponent(name)}/stop`));
}

export async function restartPm2App(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/pm2/${encodeURIComponent(name)}/restart`));
}

/** Hapus app dari PM2 (proses + entry, BUKAN file project). Selalu kirim confirm:true - konfirmasi asli dilakukan di sisi app (Alert.alert) SEBELUM fungsi ini dipanggil. */
export async function deletePm2App(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(
    c.delete(`/pm2/${encodeURIComponent(name)}`, {
      data: { confirm: true },
    })
  );
}

export interface SaveStartupResult {
  results: { user: string; ok: boolean; output?: string; errorMessage?: string }[];
}

/** Simpan startup list PM2 (`pm2 save`) untuk semua deploy_user relevan, biar app tetap jalan otomatis kalau VPS reboot. */
export async function savePm2Startup(): Promise<SaveStartupResult> {
  const c = await client();
  return unwrap(c.post('/pm2/save-startup'));
}

// ===================== Security (read-only) - Fase G =====================
//
// Backend balikin HTTP 400 (bukan 200 dgn flag) buat kondisi "normal tapi
// gak aktif" (mis. fail2ban belum terinstall, firewall gak terdeteksi) -
// kode error-nya kita tangkep di sini dan diterjemahin jadi hasil "tidak
// aktif" yang tenang, BUKAN dilempar sebagai error merah ke UI (itu bukan
// bug, itu kondisi server yang wajar).

function isNotDetected(err: unknown, action: string): boolean {
  const expectedCode = `SECURITY_${action.toUpperCase()}_FAILED`;
  return err instanceof ApiError && err.code === expectedCode;
}

export interface FirewallStatus {
  detected: boolean;
  active: boolean;
  tool?: string;
  output?: string;
}

/**
 * "detected" cuma berarti perintah cek (`ufw status` / `firewall-cmd
 * --state`) BERHASIL dijalanin - itu TETEP sukses (exit code 0) walau
 * firewall-nya lagi mati (`ufw status` yang inactive pun exit 0, isinya
 * cuma teks "Status: inactive"). Jadi status ON/OFF yang sebenarnya harus
 * di-parse dari isi output-nya, bukan dari "detected" doang - beda hal.
 */
function parseFirewallActive(tool: string | undefined, output: string | undefined): boolean {
  if (!output) return false;
  if (tool === 'firewalld') {
    // `firewall-cmd --state` balikin teks "running" kalau aktif.
    return /^running/i.test(output.trim());
  }
  // default ufw: baris pertama "Status: active" atau "Status: inactive".
  return /status:\s*active/i.test(output);
}

export async function getFirewallStatus(): Promise<FirewallStatus> {
  try {
    const c = await client();
    const data = await unwrap<{ tool: string; output: string }>(c.get('/security/firewall'));
    return { detected: true, active: parseFirewallActive(data.tool, data.output), ...data };
  } catch (err) {
    if (isNotDetected(err, 'CHECKFIREWALL')) return { detected: false, active: false };
    throw err;
  }
}

export interface OpenPort {
  port: string;
  address: string;
  processName: string | null;
  pid: string | null;
  process: string;
}

export async function listOpenPorts(): Promise<{ ports: OpenPort[] }> {
  const c = await client();
  return unwrap(c.get('/security/ports'));
}

export interface Fail2banStatus {
  installed: boolean;
  output?: string;
}

export async function getFail2banStatus(): Promise<Fail2banStatus> {
  try {
    const c = await client();
    return await unwrap<Fail2banStatus>(c.get('/security/fail2ban'));
  } catch (err) {
    if (isNotDetected(err, 'CHECKFAIL2BAN')) return { installed: false };
    throw err;
  }
}

export interface SshConfigStatus {
  available: boolean;
  settings?: Record<string, string>;
}

export async function getSshConfigStatus(): Promise<SshConfigStatus> {
  try {
    const c = await client();
    const data = await unwrap<{ settings: Record<string, string> }>(c.get('/security/ssh'));
    return { available: true, ...data };
  } catch (err) {
    if (isNotDetected(err, 'CHECKSSHCONFIG')) return { available: false };
    throw err;
  }
}

// ===================== Scanner (read-only) - Fase G =====================

export interface ProjectPortCheck {
  name: string;
  port: number | string;
  open: boolean;
  categoryLabel: string | null;
}

export interface OrphanPort {
  port: string;
  address: string;
  category: string;
  label: string;
}

export interface ApiHealthResult {
  name: string;
  port: number | string;
  reachable: boolean;
  status: number | null;
  note: string | null;
}

export interface RegistryMatch {
  name: string;
  folderExists: boolean;
  pm2Found: boolean;
  pm2Status: string | null;
  portMatch: boolean | null;
  domainMatch: boolean | null;
}

export interface ScanFullResult {
  pm2: { apps: Pm2App[]; warnings: string[] };
  ports: { projectChecks: ProjectPortCheck[]; orphanPorts: OrphanPort[] };
  api: ApiHealthResult[];
  registryMatches: RegistryMatch[];
  orphanPm2Apps: Pm2App[];
}

export async function scanFull(): Promise<ScanFullResult> {
  const c = await client();
  return unwrap(c.get('/scanner/full'));
}

// ===================== Domain (status gabungan) =====================
// Satu response gabungin 3 sumber yang sebelumnya cuma bisa dicek terpisah
// lewat 3 menu (Site Nginx / SSL / Project) - lihat GET /domains di backend.

export interface DomainStatus {
  domain: string;
  nginx: { exists: boolean; file?: string; target?: string };
  project: { name: string; alive: boolean; port: number } | null;
  ssl: { exists: boolean; daysLeft: number | null; expiringSoon: boolean };
}

export async function listDomains(): Promise<DomainStatus[]> {
  const c = await client();
  return unwrap(c.get('/domains'));
}

export async function getDomainStatus(domain: string): Promise<DomainStatus> {
  const c = await client();
  return unwrap(c.get(`/domains/${encodeURIComponent(domain)}`));
}

// ===================== Nginx (Fase C) =====================

export interface NginxSite {
  file: string;
  domain: string;
  target: string;
}

export async function listNginxSites(): Promise<{ sites: NginxSite[] }> {
  const c = await client();
  return unwrap(c.get('/nginx/sites'));
}

export interface NginxSiteDetail extends NginxSite {
  content: string;
}

export async function viewNginxSite(file: string): Promise<NginxSiteDetail> {
  const c = await client();
  return unwrap(c.get(`/nginx/sites/${encodeURIComponent(file)}`));
}

export async function createNginxSite(domain: string, port: number): Promise<void> {
  const c = await client();
  return unwrap(c.post('/nginx/sites', { domain, port }));
}

/** Hapus site. Selalu kirim confirm:true - konfirmasi asli via Alert.alert di sisi app sebelum fungsi ini dipanggil. */
export async function deleteNginxSite(file: string): Promise<void> {
  const c = await client();
  return unwrap(
    c.delete(`/nginx/sites/${encodeURIComponent(file)}`, {
      data: { confirm: true },
    })
  );
}

export async function testNginxConfig(): Promise<{ valid: boolean; output: string }> {
  const c = await client();
  return unwrap(c.get('/nginx/test-config'));
}

export async function reloadNginx(): Promise<void> {
  const c = await client();
  return unwrap(c.post('/nginx/reload'));
}

// ===================== Git (Fase D) =====================

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  changedFiles: string[];
  remoteCheckFailed: boolean;
}

export async function getGitStatus(name: string): Promise<GitStatus> {
  const c = await client();
  return unwrap(c.get(`/git/${encodeURIComponent(name)}/status`));
}

export async function listGitBranches(name: string): Promise<{ branches: string[] }> {
  const c = await client();
  return unwrap(c.get(`/git/${encodeURIComponent(name)}/branches`));
}

export async function getGitLog(name: string, limit = 15): Promise<{ limit: number; output: string }> {
  const c = await client();
  return unwrap(c.get(`/git/${encodeURIComponent(name)}/log`, { params: { limit } }));
}

export async function gitPull(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/git/${encodeURIComponent(name)}/pull`));
}

export async function gitCheckout(name: string, branch: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/git/${encodeURIComponent(name)}/checkout`, { branch }));
}

export async function gitStash(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/git/${encodeURIComponent(name)}/stash`));
}

// Jalan keluar buat kondisi yang gak bisa diselesaikan gitPull()/gitStash()
// biasa (unmerged files/conflict) - DESTRUKTIF, buang semua perubahan lokal.
export async function gitForceSync(name: string): Promise<{ output: string }> {
  const c = await client();
  return unwrap(c.post(`/git/${encodeURIComponent(name)}/force-sync`, { confirm: true }));
}

export async function getPm2Logs(name: string, lines = 200): Promise<{ name: string; owner: string; lines: number; output: string }> {
  const c = await client();
  return unwrap(c.get(`/pm2/${encodeURIComponent(name)}/logs`, { params: { lines } }));
}

// ===================== Deploy =====================

export interface DeployPayload {
  name: string;
  gitRepo: string;
  domain: string;
  port: number;
  folderPath: string;
  branch?: string;
  deployUser?: string;
  envContent?: string;
  prismaMode?: 'none' | 'generate' | 'push' | 'push_force' | 'migrate';
  // Label akun GitHub tersimpan (dari listGithubAccounts()) - kirim ini kalau
  // repo-nya PRIVATE, biar backend nyisipin username:token ke cloneUrl.
  // Tanpa ini, clone repo private selalu gagal ("could not read Username").
  githubAccountLabel?: string;
}

export async function deployProject(payload: DeployPayload): Promise<{ jobId: string }> {
  const c = await client();
  return unwrap(c.post('/deploy', payload));
}

export interface RetryOverrides {
  envContent?: string;
  port?: number;
  domain?: string;
  branch?: string;
  prismaMode?: 'none' | 'generate' | 'push' | 'push_force' | 'migrate';
}

export async function retryDeploy(jobId: string, overrides?: RetryOverrides): Promise<{ jobId: string }> {
  const c = await client();
  return unwrap(c.post(`/deploy/${encodeURIComponent(jobId)}/retry`, overrides || {}));
}

// ===================== SSL =====================

export async function issueSSL(domain: string): Promise<{ jobId: string }> {
  const c = await client();
  return unwrap(c.post('/ssl/issue', { domain }));
}

// ===================== Jobs =====================

export type JobStatus = 'pending' | 'running' | 'success' | 'failed' | 'interrupted';

// FIX: bentuk asli tiap step yang disimpan backend (lihat jobStore.js
// appendJobStep(), dipanggil SEMUA worker - deploy/retry/build/seed/ssl)
// itu { step, ok, message, at } - field `step` isinya LABEL manusia (mis.
// "PM2 Start"), bukan machine-key, dan gak ada field terpisah buat itu.
// Sebelumnya interface ini nyari { key, label, status } yang gak pernah
// ada di response manapun - efeknya SETIAP baris log job (semua jenis job,
// dari awal) selalu nunjukin "undefined - undefined" (buildLogText di
// index.tsx) dan ikon status selalu titik abu-abu, gak pernah ✓/✗
// (TerminalLog.tsx) - karena step.key/label/status semua selalu undefined.
export interface JobStep {
  step: string;
  ok: boolean;
  message?: string;
  at: string;
}

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  message: string;
  params: Record<string, unknown>;
  steps: JobStep[];
  stoppedAtKey?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function listJobs(): Promise<Job[]> {
  const c = await client();
  return unwrap(c.get('/jobs'));
}

export async function getJob(id: string): Promise<Job> {
  const c = await client();
  return unwrap(c.get(`/jobs/${encodeURIComponent(id)}`));
}

// ===================== Cleanup (cache project) - Fase I =====================
//
// Wire ke `GET /cleanup/scan/projects` & `POST /cleanup/delete` yang sudah
// ADA di backend (dipakai CLI, belum pernah di-expose ke app). Sengaja cuma
// scope "cache project" (dari cwd PM2 tiap app) - BUKAN cache global user OS
// (`GET /cleanup/scan/user/:username`), itu di luar scope fase ini.

export interface CacheItem {
  label: string;
  path: string;
  bytes: number;
  owner: string;
  /** Folder cwd project (basis validasi "path harus di dalam sini" pas hapus). */
  home: string;
  project: string | null;
}

export interface CacheScanResult {
  items: CacheItem[];
  totalBytes: number;
  totalBytesLabel: string;
}

export async function scanProjectCaches(): Promise<CacheScanResult> {
  const c = await client();
  return unwrap(c.get('/cleanup/scan/projects'));
}

/** Hapus satu item cache. Selalu kirim confirm:true - konfirmasi asli dilakukan di app (AppModal) SEBELUM dipanggil. */
export async function deleteCacheItem(owner: string, targetPath: string): Promise<void> {
  const c = await client();
  await unwrap<void>(
    c.post('/cleanup/delete', { username: owner, targetPath, confirm: true })
  );
}

// ===================== Health (no auth, dipakai buat "Test Connection") =====================

// ===================== Backup & Restore =====================
// Endpoint-endpoint di bawah ini SINKRON (nunggu tar/mysqldump/mysql restore
// selesai baru response), BUKAN job-based kayak Deploy. Backend sendiri kasih
// toleransi sampai 30 menit buat operasi database (lihat DB_TIMEOUT_MS di
// backup.js) - timeout default axios (15s, lihat client()) terlalu pendek dan
// bisa bikin app teriak "gagal" padahal proses di server masih/sudah selesai
// jalan. Makanya semua call di bawah pakai override timeout sendiri per-request
// (bukan ganti default global, biar endpoint lain tetap cepat gagal kalau
// network beneran mati).
const BACKUP_PROJECT_TIMEOUT_MS = 3 * 60 * 1000; // tar exclude node_modules/.next, harusnya cepat, tapi kasih ruang
const BACKUP_DB_TIMEOUT_MS = 6 * 60 * 1000; // mysqldump/restore bisa lama buat db besar

export interface BackupFile {
  filename: string;
  kind: 'project' | 'database' | 'unknown';
  name: string;
  timestamp: Date | null;
}

/**
 * Parse nama file backup jadi info yang enak ditampilkan. Format dijamin
 * oleh backend (backup.js): `project-{name}-{ISO timestamp dgn : . diganti -}.tar.gz`
 * atau `db-{dbName}-{timestamp}.sql.gz`. Kalau format gak dikenali (backup versi
 * lama / manual), tetap ditampilkan apa adanya sebagai kind 'unknown'.
 */
export function parseBackupFilename(filename: string): BackupFile {
  const projectMatch = filename.match(/^project-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.tar\.gz$/);
  if (projectMatch) {
    return {
      filename,
      kind: 'project',
      name: projectMatch[1],
      timestamp: parseBackupTimestamp(projectMatch[2]),
    };
  }
  const dbMatch = filename.match(/^db-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.sql\.gz$/);
  if (dbMatch) {
    return {
      filename,
      kind: 'database',
      name: dbMatch[1],
      timestamp: parseBackupTimestamp(dbMatch[2]),
    };
  }
  return { filename, kind: 'unknown', name: filename, timestamp: null };
}

function parseBackupTimestamp(raw: string): Date | null {
  // "2026-07-27T10-30-15-123Z" -> "2026-07-27T10:30:15.123Z"
  const iso = raw.replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1T$2:$3:$4.$5Z'
  );
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function listBackups(): Promise<{ backups: string[] }> {
  const c = await client();
  return unwrap(c.get('/backup'));
}

export async function backupProject(name: string): Promise<{ file: string }> {
  const c = await client();
  return unwrap(c.post(`/backup/projects/${encodeURIComponent(name)}`, {}, { timeout: BACKUP_PROJECT_TIMEOUT_MS }));
}

export async function backupDatabase(dbName: string): Promise<{ file: string }> {
  const c = await client();
  return unwrap(c.post(`/backup/databases/${encodeURIComponent(dbName)}`, {}, { timeout: BACKUP_DB_TIMEOUT_MS }));
}

export async function restoreProject(name: string, filename: string): Promise<void> {
  const c = await client();
  return unwrap(
    c.post(
      `/backup/projects/${encodeURIComponent(name)}/restore`,
      { filename, confirm: true },
      { timeout: BACKUP_PROJECT_TIMEOUT_MS }
    )
  );
}

export async function restoreDatabase(dbName: string, filename: string): Promise<void> {
  const c = await client();
  return unwrap(
    c.post(
      `/backup/databases/${encodeURIComponent(dbName)}/restore`,
      { filename, confirm: true },
      { timeout: BACKUP_DB_TIMEOUT_MS }
    )
  );
}

export async function deleteBackup(filename: string): Promise<void> {
  const c = await client();
  return unwrap(c.delete(`/backup/${encodeURIComponent(filename)}`, { data: { confirm: true } }));
}

export interface SqlFileEntry {
  file: string;
  dir: string;
  fullPath: string;
}

/**
 * Scan file .sql/.sql.gz "lepas" di folder umum VPS (backup_dir, /root, home
 * dir) - read-only. `fullPath` hasil scan ini WAJIB dipakai persis buat
 * importSqlFile() di bawah (backend cross-check exact match, gak percaya
 * path bebas dari body - lihat catatan di backup.routes.js).
 */
export async function scanSqlFiles(): Promise<{ files: SqlFileEntry[]; scannedDirs: string[] }> {
  const c = await client();
  return unwrap(c.get('/backup/sql-files'));
}

/**
 * Import salah satu file hasil scanSqlFiles() ke database tujuan. MENIMPA
 * data di database tujuan - DESTRUKTIF, gak ada undo otomatis. Timeout
 * disamain sama restoreDatabase() (import lewat `mysql` stdin, bisa lama
 * buat file besar).
 */
export async function importSqlFile(dbName: string, fullPath: string): Promise<void> {
  const c = await client();
  return unwrap(
    c.post('/backup/import-sql', { dbName, fullPath, confirm: true }, { timeout: BACKUP_DB_TIMEOUT_MS })
  );
}

/**
 * URL + header buat download langsung (dipakai expo-file-system, bukan
 * axios, karena downloadAsync butuh URL mentah + header, bukan instance
 * axios). Dibaca fresh dari SecureStore sama kayak client() - bukan di-cache.
 */
export async function getDownloadTarget(filename: string): Promise<{ url: string; headers: Record<string, string> }> {
  const [baseURL, apiKey] = await Promise.all([getBaseUrl(), getApiKey()]);
  if (!baseURL || !apiKey) {
    throw new ApiError('Belum ada koneksi ke VPS. Isi dulu di Settings.', 'NOT_CONFIGURED');
  }
  const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  return {
    url: `${base}/backup/${encodeURIComponent(filename)}/download`,
    headers: { Authorization: `Bearer ${apiKey}` },
  };
}

export interface UploadSqlResult {
  file: string;
  fullPath: string;
}

/**
 * Upload file .sql/.sql.gz dari HP (URI hasil DocumentPicker) ke backup_dir
 * di server lewat multipart/form-data. Setelah sukses, file ini otomatis
 * kejaring scanSqlFiles() berikutnya (backup_dir salah satu folder yang
 * di-scan) - jadi alur import SETELAHNYA tetap sama kayak file lepas biasa,
 * gak butuh endpoint import baru.
 */
export async function uploadSqlFile(fileUri: string, fileName: string, mimeType?: string): Promise<UploadSqlResult> {
  const c = await client();
  const form = new FormData();
  // React Native FormData butuh shape { uri, name, type } - beda dari
  // Blob/File di web, ini konvensi resmi RN buat file upload.
  form.append('file', {
    uri: fileUri,
    name: fileName,
    type: mimeType || 'application/sql',
  } as unknown as Blob);
  return unwrap(
    c.post('/backup/upload-sql', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: BACKUP_DB_TIMEOUT_MS,
    })
  );
}

// ===================== Project Build & Seed (job-based) =====================

export interface ProjectBuildSteps {
  install?: boolean;
  prismaMode?: 'none' | 'generate' | 'push' | 'push_force' | 'migrate';
  build?: boolean;
  restartPm2?: boolean;
}

/**
 * Jalankan install/prisma/build/restart PM2 manual di luar alur Deploy -
 * job-based sama seperti deployProject(), progress dipoll lewat GET /jobs/:id
 * (pakai getJob()). Job type-nya "project_build".
 */
// FIX (404 "Endpoint tidak ditemukan"): backend mount build.routes.js di
// /project (lihat server.js: `app.use('/project', buildRoutes)`), BUKAN
// /build - path /build/... di sini sebelumnya salah dari awal, gak pernah
// nyambung ke endpoint manapun. "Jalankan Build" DAN "Jalankan Seed"
// dua-duanya kena (dua-duanya manggil helper ini).
export async function runProjectBuild(name: string, steps: ProjectBuildSteps): Promise<{ jobId: string }> {
  const c = await client();
  return unwrap(c.post(`/project/${encodeURIComponent(name)}/build`, steps));
}

/** Jalankan `prisma db seed` manual - job-based, job type "project_seed". */
export async function runProjectSeed(name: string): Promise<{ jobId: string }> {
  const c = await client();
  return unwrap(c.post(`/project/${encodeURIComponent(name)}/seed`));
}

// ===================== Project (Env & Delete) =====================

/** Baca isi mentah file .env project (string apa adanya, boleh kosong). */
export async function getProjectEnv(name: string): Promise<{ content: string }> {
  const c = await client();
  return unwrap(c.get(`/project/${encodeURIComponent(name)}/env`));
}

/**
 * Timpa isi .env project dengan `content` (string mentah). MENIMPA isi lama
 * secara permanen - selalu kirim confirm:true, konfirmasi asli dilakukan
 * di app (AppModal) sebelum fungsi ini dipanggil.
 */
export async function updateProjectEnv(name: string, content: string): Promise<void> {
  const c = await client();
  await unwrap<void>(c.put(`/project/${encodeURIComponent(name)}/env`, { content, confirm: true }));
}

export interface DeletePreview {
  pm2App: { name: string; status: string } | null;
  nginxFile: string | null;
  nginxCheckFailed: boolean;
  nginxCheckError: string | null;
  relatedDatabases: { dbName: string; usedByProject: string }[];
  folderExists: boolean;
}

/** Preview read-only dampak hapus project - dipanggil SEBELUM eksekusi delete. */
export async function getProjectDeletePreview(name: string): Promise<DeletePreview> {
  const c = await client();
  return unwrap(c.get(`/project/${encodeURIComponent(name)}/delete-preview`));
}

export interface DeleteProjectOptions {
  deletePm2?: boolean;
  deleteNginx?: boolean;
  dropDatabases?: boolean;
  deleteFolder?: boolean;
}

export interface DeleteProjectResult {
  results: { step: string; ok: boolean; message?: string }[];
}

/**
 * Eksekusi hapus project. DESTRUKTIF & sebagian efeknya (drop database,
 * hapus folder) tidak ada undo - selalu kirim confirm:true, konfirmasi asli
 * (termasuk preview dampak) sudah dilakukan di app sebelum ini dipanggil.
 */
export async function deleteProjectFull(name: string, opts: DeleteProjectOptions): Promise<DeleteProjectResult> {
  const c = await client();
  return unwrap(c.post(`/project/${encodeURIComponent(name)}/delete`, { ...opts, confirm: true }));
}

// ===================== Git Credentials & GitHub Accounts =====================

export interface GithubAccount {
  label: string;
  username: string;
}

/** Daftar akun GitHub tersimpan di Configuration (token TIDAK pernah dikirim balik). */
export async function listGithubAccounts(): Promise<{ accounts: GithubAccount[] }> {
  const c = await client();
  return unwrap(c.get('/config/github'));
}

/**
 * Tambah/replace akun GitHub tersimpan (label sama = ditimpa, termasuk token
 * lamanya). Bukan aksi destruktif ke data lain, gak perlu confirm.
 */
export async function addGithubAccount(opts: { label: string; username: string; token: string }): Promise<void> {
  const c = await client();
  await unwrap<void>(c.post('/config/github', opts));
}

/** Hapus akun GitHub tersimpan. Selalu kirim confirm:true - konfirmasi asli via AppModal di sisi app sebelum fungsi ini dipanggil. */
export async function removeGithubAccount(label: string): Promise<void> {
  const c = await client();
  await unwrap<void>(
    c.delete(`/config/github/${encodeURIComponent(label)}`, {
      data: { confirm: true },
    })
  );
}

/**
 * Terapkan kredensial GitHub ke remote origin project ini - pakai salah satu
 * akun tersimpan (accountLabel) atau URL manual (manualUrl). Bukan aksi
 * destruktif, gak perlu confirm.
 */
export async function updateGitCredentials(
  name: string,
  opts: { accountLabel?: string; manualUrl?: string }
): Promise<void> {
  const c = await client();
  await unwrap<void>(c.post(`/git/${encodeURIComponent(name)}/credentials`, opts));
}

// ===================== Doctor (Cek Kesiapan Sistem) =====================

export interface DoctorIssue {
  code: string;
  message: string;
  hint?: string;
  command?: string;
}

export interface DoctorResult {
  ok: boolean;
  deployUser: string;
  defaultFolder: string;
  sudo: { ok: boolean; reason?: string };
  sudoCommands: { name: string; ok: boolean; reason?: string | null }[];
  folder: { ok: boolean; exists?: boolean; owner?: string | null; mode?: number; reason?: string };
  commands: { command: string; available: boolean }[];
  issues: DoctorIssue[];
}

/** Self-check kesiapan sistem: sudoers, owner folder deploy, command eksternal (git/nginx/certbot/dst). Read-only. */
export async function getDoctorPermissions(): Promise<DoctorResult> {
  const c = await client();
  return unwrap(c.get('/doctor/permissions'));
}

export async function healthCheck(baseUrl: string): Promise<boolean> {
  try {
    const res = await axios.get(`${baseUrl.replace(/\/+$/, '')}/health`, { timeout: 8000 });
    return Boolean(res.data?.success);
  } catch {
    return false;
  }
}

// ===================== Terminal (POST /system/exec) =====================
// PERINGATAN: command dikirim APA ADANYA ke server dan dieksekusi lewat
// shell - lihat catatan keamanan di system.routes.js.

export interface ExecResult {
  output: string;
  exitOk: boolean;
  errorMessage?: string;
}

export async function execCommand(command: string): Promise<ExecResult> {
  const c = await client();
  return unwrap(c.post('/system/exec', { command }, { timeout: 35000 }));
}
