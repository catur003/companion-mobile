import { useRouter } from 'expo-router';

type Router = ReturnType<typeof useRouter>;

/**
 * Navigasi ke rute NESTED di tab lain, dengan jaminan index tab tujuan jadi
 * dasar history-nya - termasuk kasus tab itu belum pernah dimount sama
 * sekali (cold start app -> langsung tap ke rute nested di tab yang belum
 * pernah dibuka).
 *
 * Kenapa perlu nunda push kedua: push ke index tab lalu push ke rute
 * nested dalam TICK YANG SAMA gak reliable kalau tab tujuan belum pernah
 * dimount - Stack navigator-nya baru selesai "commit" (termasuk
 * initialRouteName-nya) beberapa saat setelah push pertama.
 *
 * FIXED: sebelumnya pakai `setTimeout(fn, 0)` - ternyata TETAP kadang
 * kepotong pas COLD START (thread JS lagi sibuk banget ngerjain init app:
 * load font, React Query, dll - timer 0ms bisa aja "matang" SEBELUM commit
 * navigasi pertama selesai, beda dari kondisi warm/app-udah-jalan-lama yang
 * lebih longgar). Double `requestAnimationFrame` lebih reliable buat kasus
 * ini - rAF kedua dijamin baru jalan SETELAH frame hasil commit navigasi
 * pertama beneran ke-render, bukan cuma "nunggu tick berikutnya" kayak
 * setTimeout yang gak peduli render udah kelar apa belum.
 */
export function pushIntoTab(router: Router, tabIndexPath: string, targetPath: string) {
  router.push(tabIndexPath as never);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      router.push(targetPath as never);
    });
  });
}
