import type { RegisteredCoolifyProject } from './companionApi';

/**
 * UBAH (4 Agustus 2026): dulu file ini isinya array hardcode COOLIFY_PROJECTS
 * - masalahnya nambah 1 project = wajib build ulang app mobile (gak praktis).
 * Sekarang data-nya di-fetch dari Companion API (listRegisteredProjects di
 * companionApi.ts, baca projects.json di VPS). File ini tinggal nyisain
 * types + helper filter, dipakai bareng hasil fetch di masing-masing screen.
 */
export type CoolifyProject = RegisteredCoolifyProject;

export function coolifyProjectsWithDatabase(projects: CoolifyProject[]): CoolifyProject[] {
  return projects.filter((p) => Boolean(p.databaseUuid));
}
