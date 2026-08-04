# ZenVPS App

App Android (React Native + Expo) buat kelola VPS Anda (database, deploy, SSL, jobs) lewat API `vps-manager`. Dibuat supaya bisa disiapin & di-build langsung dari Termux, tanpa wajib Android Studio.

## Fitur (semua endpoint yang ada di API dicover)

- **Dashboard** — status server (CPU, RAM, disk, uptime, load average) via `GET /monitor` + daftar app PM2 yang jalan (start/stop/restart/hapus langsung dari card)
- **Database**
  - List semua database — `GET /database`
  - Buat database baru — `POST /database`
  - List tabel — `GET /database/:dbName/tables`
  - Struktur kolom tabel — `GET /database/:dbName/tables/:tableName/describe`
  - Jumlah baris — `GET /database/:dbName/tables/:tableName/count`
  - Preview isi tabel — `GET /database/:dbName/tables/:tableName/preview`
  - Reset password user — `POST /database/:dbName/reset-password`
  - Drop database (dengan konfirmasi wajib) — `DELETE /database/:dbName`
- **Deploy**
  - Deploy project Next.js baru — `POST /deploy`
  - Retry deploy yang gagal — `POST /deploy/:jobId/retry`
  - Terbitkan SSL — `POST /ssl/issue`
  - List & detail job (log real-time via polling) — `GET /jobs`, `GET /jobs/:id`
  - **Nginx**: list/lihat config mentah/buat/hapus site, test config — `GET/POST/DELETE /nginx/sites`, `GET /nginx/test-config`
  - **Git** per project: status/branch/log/pull/checkout/stash — `GET/POST /git/:name/*`
- **Diagnostik**
  - Keamanan: status firewall, fail2ban, config SSH, port terbuka — `GET /security/*`
  - Scan lengkap: cocokkan PM2/port/domain ke registry, health-check API, temuan orphan — `GET /scanner/full`
- **Settings** — simpan URL API & API key VPS (disimpan di Android Keystore lewat `expo-secure-store`, bukan plaintext)

## 1. Setup awal (dari Termux atau laptop)

```bash
cd ZenVPSApp
rm -rf node_modules package-lock.json   # WAJIB - biar gak ke-lock ke versi SDK lama
npm install
npx expo install --fix   # samain versi paket ke SDK Expo yang lagi aktif (koreksi otomatis kalau ada versi yang saya salah tebak)
```

> Kalau nanti muncul lagi error "Project is incompatible with this version of Expo Go" (SDK project vs SDK Expo Go beda), itu tandanya Expo Go di HP Anda ke-update ke SDK lebih baru. Perbaikannya: naikkan angka `"expo": "~XX.0.0"` di `package.json` ke SDK yang diminta pesan errornya, ulangi 3 baris di atas.

## 2. Jalanin buat development (opsional, buat cek tampilan dulu)

```bash
npx expo start
```
Scan QR code-nya pakai app **Expo Go** di HP Android buat preview cepat (fitur native kayak SecureStore tetap jalan di Expo Go).

## 3. Siapin API key di VPS (backend)

Di VPS, jalanin sekali:
```bash
npm run api:keygen
```
Simpan key yang muncul (cuma ditampilin sekali). Ini yang nanti dimasukin ke tab **Setelan** di app.

API-nya sendiri jalan di `127.0.0.1:4001` (localhost only, port default — cek `config.json` kalau sudah diubah) dan **tidak pernah expose port itu langsung ke internet**. Wajib pasang reverse proxy + SSL lewat Nginx dulu (pakai fitur Nginx/SSL yang sudah ada di vps-manager), baru URL publik hasil proxy itu yang diisi di kolom "URL API" pada app — bukan alamat `:4001` langsung.

## 4. Build jadi APK (lewat cloud, bisa dari Termux)

```bash
npm install -g eas-cli
eas login          # bikin akun Expo dulu kalau belum punya (gratis)
eas build:configure   # generate/isi projectId di app.json (extra.eas.projectId)
eas build -p android --profile preview
```
Proses build jalan di server Expo (bukan lokal), jadi ringan buat Termux — tinggal nunggu link download `.apk` muncul di terminal/dashboard Expo, lalu install manual di HP.

Buat versi Play Store (`.aab`):
```bash
eas build -p android --profile production
```

## Struktur folder

```
app/                     # routing (expo-router, file-based)
  _layout.tsx             # root: QueryClientProvider + cek koneksi tersimpan
  settings.tsx             # onboarding modal (isi URL API + API key)
  (tabs)/
    _layout.tsx             # bottom tabs: Dashboard, Database, Deploy, Diagnostik, Setelan
    index.tsx                # Dashboard (monitor + App yang Jalan/PM2)
    diagnostik.tsx            # Keamanan (firewall/fail2ban/ssh/port) + Scan Server
    settings.tsx              # Setelan (tab)
    database/
      index.tsx                # list database
      create.tsx                # form buat database baru
      [dbName]/index.tsx         # detail: list tabel, reset password, drop
      [dbName]/[tableName].tsx    # struktur / jumlah baris / preview tabel
    deploy/
      index.tsx                # list job (deploy + SSL) + link ke Nginx
      new.tsx                   # form deploy project baru
      ssl.tsx                    # form terbitkan SSL
      [jobId]/index.tsx           # detail job, log ala terminal (live polling)
      [jobId]/retry.tsx            # retry deploy gagal (override env/port/domain)
      nginx/index.tsx             # list site nginx
      nginx/new.tsx                 # form buat site baru
      nginx/[file].tsx               # detail site: config mentah, test config, hapus
      git/[name].tsx                  # status/branch/log/pull/checkout/stash per project
lib/
  api.ts        # semua fungsi panggil API (axios), 1:1 sama endpoint backend
  storage.ts    # simpan URL API & API key ke SecureStore
  theme.ts      # design token (spacing/radius/mono) + colors dari themes.ts
  themes.ts     # registry palet warna (single source of truth, siap multi-tema)
  queryClient.ts
components/     # Card, Button, FormField, StatusPill, TerminalLog, SettingsForm,
                # ProgressBar, Fab, PmAppCard
```

## Catatan penting

- Aksi destruktif (**Drop Database**, **Hapus App PM2**, **Hapus Site Nginx**) sudah wajib konfirmasi 2 lapis (dialog di app + `confirm: true` yang ditolak backend kalau kosong).
- HTTPS di depan API **wajib** sebelum app ini dipakai lewat internet publik — API key & password database lewat di header/body.
- Lihat `CHANGELOG.md` buat riwayat fase pengembangan (Fase A-D dst).
