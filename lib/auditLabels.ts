import { AuditLogEntry } from './companionApi';

/**
 * Mapping "action" mentah (sama persis kayak key di commandPolicy.js
 * Companion API) ke label Bahasa Indonesia buat ditampilin di layar Audit
 * Log - user secara eksplisit minta TANPA emoji/icon, murni teks jelas.
 *
 * Kalau ada action baru ditambahin di Companion API tapi lupa didaftarin
 * di sini, fallback di getActionLabel() nampilin action mentahnya apa
 * adanya (bukan label kosong/error) - biar gak ada entry "hilang" dari
 * tampilan cuma gara-gara belum sempet dipetakan.
 */
const ACTION_LABELS: Record<string, string> = {
  'files:read': 'Baca file di container',
  'files:write': 'Tulis/timpa file di container',
  'db:query:select': 'Jalankan query SELECT',
  'db:query:mutate': 'Jalankan query ubah data',
  'db:reset-password': 'Reset password database',
  'db:list-schemas': 'Lihat daftar schema database',
  'db:create-schema': 'Buat schema database baru',
  'db:drop-schema': 'Hapus schema database',
  'db:import': 'Import dump database',
  'db:export': 'Export dump database',
  'db:migrate:generate': 'Generate migrasi Prisma',
  'db:migrate:push': 'Push schema ke database',
  'db:migrate:push_force': 'Push force schema (data loss)',
  'db:migrate:migrate': 'Jalankan migrate deploy',
  'db:migrate:seed': 'Jalankan seed database',
  'db:migrate:custom': 'Jalankan command migrasi custom',
  'container:restart-count:read': 'Cek jumlah restart container',
  'system:status:read': 'Cek status VPS',
  'system:security:read': 'Cek konfigurasi keamanan VPS',
  'projects:write': 'Ubah mapping project',
  'diagnostics:containers:read': 'Lihat info container Docker',
};

export function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * Field konteks yang ditampilin sebagai baris kedua per entry - beda-beda
 * tergantung action, urutan prioritas dari yang paling informatif. Field
 * kredensial (password dsb) TIDAK PERNAH ada di data ini sama sekali -
 * Companion API sengaja gak pernah audit.record() itu (lihat komentar di
 * dbAdmin.routes.js).
 */
const CONTEXT_FIELD_PRIORITY = [
  'command',
  'sql',
  'applicationUuid',
  'databaseUuid',
  'containerId',
  'deletedKey',
  'error',
] as const;

export function getContextSummary(entry: AuditLogEntry): string | null {
  for (const field of CONTEXT_FIELD_PRIORITY) {
    const value = entry[field];
    if (typeof value === 'string' && value.trim()) {
      // SQL/command bisa panjang - potong biar gak bikin list item jadi tinggi banget.
      return value.length > 80 ? `${value.slice(0, 80)}…` : value;
    }
  }
  return null;
}

/** Waktu relatif sederhana, Bahasa Indonesia - gak nambah dependency baru (date-fns/dayjs dst) buat kebutuhan sekecil ini. */
export function formatRelativeTime(isoTimestamp: string): string {
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return isoTimestamp;

  const diffMs = Date.now() - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return 'Baru saja';
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} hari lalu`;

  const d = new Date(isoTimestamp);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
