/**
 * Daftar project yang udah migrasi ke Coolify - SATU sumber kebenaran,
 * gantiin constant PORTOFOLIO_CONTAINER_ID/APPLICATION_UUID yang tadinya
 * tersebar di tiap screen (Dashboard, Database, Deploy).
 *
 * Kenapa baru sekarang, bukan dari awal Fase 4: desain struktur ini butuh
 * minimal 2 data buat dibandingin biar bentuknya gak asal tebak dari 1
 * contoh doang. PORTOFOLIO (Fase 2) itu data pertama, web-desa (Fase 5) data
 * kedua - baru sekarang ada dasar buat bikin ini terstruktur.
 *
 * Nambah project baru ke sini = 1 entry, TIDAK perlu edit index.tsx,
 * coolify-query.tsx, atau coolify-files.tsx satu-satu lagi.
 */
export interface CoolifyProject {
  /** Identifier stabil buat dipakai di query key React Query - bukan UUID (biar gampang dibaca di devtools). */
  key: string;
  /** Nama tampilan di UI. */
  name: string;
  /** UUID application di Coolify (stabil, TIDAK berubah tiap redeploy - beda dari container ID Docker). */
  applicationUuid: string;
  /** UUID database di Coolify - undefined kalau project ini gak punya database sendiri (mis. situs statis). */
  databaseUuid?: string;
}

export const COOLIFY_PROJECTS: CoolifyProject[] = [
  {
    key: 'portofolio',
    name: 'PORTOFOLIO',
    applicationUuid: 'bxpbj2db8xneyfquv7o9l1bk',
    databaseUuid: 'w9j9c3qkkpfg9r3tco4st5f8',
  },
  // web-desa (Fase 5) - tambah entry di sini setelah deploy & UUID-nya
  // diketahui (curl /api/v1/applications, cari name-nya). Jangan diisi
  // sebelum beneran deploy - placeholder UUID salah lebih berbahaya
  // daripada project ini belum muncul sama sekali di app.
];

/** Project yang punya database (buat dropdown di layar Coolify SQL Query). */
export function coolifyProjectsWithDatabase(): CoolifyProject[] {
  return COOLIFY_PROJECTS.filter((p) => Boolean(p.databaseUuid));
}
