# Changelog

Changelog lama dihapus & mulai dari sini lagi sesuai permintaan. Riwayat fase
sebelumnya masih ada di histori chat kalau sewaktu-waktu dibutuhkan.

## Fase 1 - Fix KeyboardScreen & Auto-scroll Keyboard (2026-07-29)

### Fixed
- **Root cause crash "Property 'KeyboardScreen' doesn't exist"**: 8 layar form
  (`deploy/new.tsx`, `deploy/nginx/new.tsx`, `deploy/ssl.tsx`,
  `deploy/[jobId]/retry.tsx`, `deploy/git/[name].tsx`, `deploy/git/[name]/env.tsx`,
  `deploy/github-accounts.tsx`, `database/create.tsx`) makai `<KeyboardScreen>`
  tapi gak pernah import komponennya sama sekali - pasti crash begitu dibuka.
  Semua 8 file sudah ditambahin `import { KeyboardScreen } from '@/components/KeyboardScreen'`.

### Changed
- `components/KeyboardScreen.tsx`: ganti pendekatan dari `KeyboardAvoidingView`
  (behavior="height" di Android suka bikin layout mantul pas keyboard buka/tutup)
  ke ScrollView polos + auto-scroll ke input yang lagi fokus, pakai
  `scrollResponderScrollNativeHandleToKeyboard` bawaan React Native (gak nambah
  dependency baru). Fungsi scroll di-expose lewat context/hook baru
  `useKeyboardScroll()`.
- `components/FormField.tsx`: otomatis manggil `scrollToInput` pas `onFocus`,
  jadi semua form yang pakai `FormField` (mayoritas layar) langsung dapet
  auto-scroll tanpa perubahan tambahan di tiap layar.
- 3 layar yang pakai raw `TextInput` (bukan lewat `FormField`) - `deploy/git/[name]/env.tsx`
  (editor .env), `deploy/github-accounts.tsx` (label/username/token), dan
  `deploy/git/[name].tsx` (manual git remote URL) - di-wire manual pakai ref +
  `onFocus={() => keyboardScroll?.scrollToInput(ref.current)}`.

## Fase 2+4 (gabungan) - Latar "Aurora Glass" (2026-07-29)

Diambil dari konsep preview `zenhub-aurora-preview.html` yang dikasih user -
cuma bagian LATAR (blob mesh gradient animasi) yang diambil, bukan seluruh
treatment glassmorphism preview (card/tombol/navbar tetap seperti sebelumnya,
gak diubah).

### Added
- `components/AuroraBackground.tsx`: latar animasi 4 blob warna yang perlahan
  bergeser/membesar-mengecil (drift), didekati pakai lingkaran bertumpuk
  opacity-bertingkat (RN gak punya `filter:blur()` bawaan) - gak nambah
  dependency baru, cuma `Animated` bawaan React Native. Dipasang SEKALI di
  `(tabs)/_layout.tsx` (di balik seluruh Tabs) biar animasinya kontinu, gak
  reset tiap pindah tab.
- `lib/themes.ts`: field baru `auroraColors: [string, string, string, string]`
  di tiap tema (dipakai APA ADANYA, bukan disederhanain jadi 1 warna flat):
  - **Aurora Glass** (`pastel`, default): persis 4 warna dari preview -
    `#2E9BF0` (iris), `#5EC8F2` (orchid), `#8FE3E8` (peach), `#3E7BD6` (teal).
  - **Ocean**: `#0EA5E9`, `#06B6D4` (aksen tema ini) + `#2FB4C9`, `#39C9B0`
    (persis dari swatch "Ocean" di preview).
  - **Sunset**: `#F97316`, `#EF4444` (aksen tema ini) + `#FF9E7D`, `#E5484D`
    (persis dari swatch "Sunset" di preview).
  - **Slate**: `#4F46E5`, `#7C3AED`, `#6E56CF`, `#8B7FD9` - diturunkan dari
    aksen indigo/violet tema ini sendiri (preview "Slate Night" versinya gelap,
    beda dari tema "Slate" terang yang sudah ada di app, jadi gak dipakai
    langsung biar gak keceplos ganti tema jadi dark mode).
  - **Forest**: `#16A34A`, `#84CC16`, `#5FD38D`, `#22C55E` - gak ada di
    preview, diturunkan dari aksen hijau/lime tema ini sendiri.
- Label tema default di `THEME_LIST` diganti dari "Pastel Ungu" jadi
  "Aurora Glass" (deskripsi disesuaikan) - accent/accentPink asli (ungu/pink)
  TIDAK diubah, cuma nama & deskripsi biar sesuai sama latar barunya.

### Changed
- `app/(tabs)/_layout.tsx`: mount `<AuroraBackground />` + `sceneContainerStyle`
  transparent + `tabBarStyle.backgroundColor: colors.card` (tab bar jadi
  translucent, senada sama Card - bukan opaque putih polos).
- 5 layar tab utama (`index.tsx`, `database/index.tsx`, `deploy/index.tsx`,
  `diagnostik.tsx`, dan `components/SettingsForm.tsx` variant `'tab'`):
  `backgroundColor: colors.bg` di style `screen` diganti `'transparent'` biar
  Aurora keliatan nembus. `SettingsForm` variant `'modal'` (dipakai onboarding
  pertama kali SEBELUM masuk Tabs, belum ada Aurora di belakangnya) TETAP
  solid `colors.bg` - gak diubah, biar gak nampilin layar kosong/transparan.
- Semua layar/komponen LAIN (card, tombol, form, modal, dll) tetap sama
  persis seperti sebelumnya - cuma latar yang berubah, sesuai permintaan.

### Fixed (setelah testing di HP)
- Aurora gak kelihatan sama sekali (background masih putih polos). Penyebab:
  `<AuroraBackground />` sempat dipasang SEKALI di `(tabs)/_layout.tsx` (di
  balik `<Tabs>`) supaya animasinya kontinu, tapi ternyata gak nembus di
  Android - tiap tab dibungkus native `Screen` (dari `react-native-screens`)
  yang punya kanvas sendiri, `sceneContainerStyle` transparent gak selalu
  diteruskan ke situ.
- Fix: `AuroraBackground` dipindah ke DALAM masing-masing 5 layar tab
  (`index.tsx`, `database/index.tsx`, `deploy/index.tsx`, `diagnostik.tsx`,
  `SettingsForm.tsx` variant `'tab'`) - jadi elemen React biasa di tree yang
  sama persis dengan konten layar, gak lewat batas native Screen sama sekali,
  dijamin nembus. Konsekuensi kecil: animasi drift reset tiap layar itu
  di-mount ulang (bukan kontinu lintas-tab lagi) - trade-off yang diterima
  demi kepastian background beneran muncul.

## Fase 3 - Terminal SSH Native (2026-07-29)

⚠️ **WAJIB REBUILD EAS** - fase ini nambah native module. Setelah
`npm install`, HARUS `npx expo prebuild` lalu build ulang APK lewat EAS
(`npm run build:apk`) - fitur baru ini GAK JALAN di Expo Go atau APK lama.

### Added
- Dependency baru: `@marcomueglich/react-native-ssh-client` v1.0.0 - fork
  dari `react-native-ssh-sftp` lama yang udah diadaptasi buat React Native
  New Architecture/TurboModules (app ini `newArchEnabled: true`, jadi lib
  originalnya yang udah 8 tahun gak di-update gak akan jalan). **Android-only**
  (belum ada dukungan iOS dari library-nya). Library ini masih sangat baru/kecil
  komunitasnya (baru rilis 1.0.0, ~4 stars) - kalau ternyata bermasalah di
  device tertentu, kasih tau biar dicariin alternatif.
- `lib/ssh.ts`: wrapper tipis di atas native module - isolasi semua
  pemanggilan library pihak ketiga di satu tempat. `connectWithPassword`
  dipakai apa adanya (terdokumentasi lengkap). `connectWithKey` (auth private
  key) di-cek dulu keberadaannya secara runtime sebelum dipanggil, karena
  README library cuma nyebut fitur ini di daftar fitur TANPA contoh kode -
  kalau ternyata method itu gak ada/beda nama di versi yang ke-install, app
  kasih pesan error yang jelas (bukan crash "undefined is not a function").
- `lib/storage.ts`: fungsi `getSshCredentials`/`setSshCredentials`/
  `clearSshCredentials`/`hasSshCredentials` - kredensial SSH (host, port,
  username, password ATAU private key+passphrase) disimpan di
  expo-secure-store, sama kayak API key vps-manager. TIDAK PERNAH dikirim ke
  backend - koneksi SSH langsung dari HP ke port 22 server.
- `app/(tabs)/deploy/ssh-credentials.tsx` (screen baru): form setup host/
  port/username + toggle Password vs Private Key, tombol "Tes Koneksi"
  (connect+disconnect doang, gak buka shell) sebelum "Simpan", plus "Hapus
  Kredensial Tersimpan".
- `app/(tabs)/deploy/ssh-terminal.tsx` (screen baru): terminal SSH beneran -
  satu shell session native dibuka sekali (`startShell`) dipakai terus buat
  semua command (`writeToShell`) sampai layar ditutup, jadi `cd` & environment
  var nempel antar-command (beda dari `terminal.tsx` lama yang tiap command
  lepas-lepas lewat `/system/exec`, gak ada state). Nampilin CTA "Setel
  Kredensial SSH" kalau belum ada kredensial tersimpan, dan pesan error jelas
  kalau connect gagal (dengan tombol "Coba Lagi").

### Changed
- `app/(tabs)/diagnostik.tsx`: tombol "Buka Terminal" jadi "Buka Terminal
  SSH" (arah ke `ssh-terminal.tsx`), plus link kecil di bawahnya ke
  "Terminal Cepat (Exec)" (`terminal.tsx` lama) buat yang belum setup SSH
  atau lagi pakai APK lama sebelum native module ke-build.
- `terminal.tsx` (exec-based) **TIDAK dipensiunin** - tetap ada sebagai
  fallback cepat, sesuai keputusan di awal fase ini. Ditambahin link kecil di
  dalamnya ke terminal SSH yang baru.
- `app/(tabs)/deploy/_layout.tsx`: daftar 2 route baru (`ssh-credentials`
  sebagai modal, `ssh-terminal` dengan header gelap senada `terminal.tsx`).

### Known limitations
- Android-only (mengikuti keterbatasan library-nya).
- Auth private key (`connectWithKey`) belum terverifikasi 100% cocok sama
  signature resli library - kalau gagal terus, pakai auth Password dulu
  (jalur ini udah pasti terdokumentasi & teruji di library-nya).
- SecureStore mungkin punya batas ukuran per-value di sebagian versi Android
  - private key RSA gede (4096-bit PEM) berisiko gagal disimpan di device
  tertentu; ED25519 jauh lebih pendek kalau ketemu masalah ini.

## Bikin Build APK Lebih Ringan (2026-07-29)

Karena kuota build EAS-nya terbatas, ini optimasi biar APK preview
(`npm run build:apk`) jauh lebih kecil - tanpa nambah risiko, semua opsi di
bawah udah dipakai luas & didokumentasikan resmi sama Expo.

### Added
- Dependency baru: `expo-build-properties` `~1.0.10` (versi yang cocok buat
  Expo SDK 54, dicek dulu biar gak beda versi pas `npx expo install --check`).
- `app.json` plugin `expo-build-properties`:
  - `enableProguardInReleaseBuilds` + `enableShrinkResourcesInReleaseBuilds`:
    kode & resource yang gak kepakai dibuang/di-obfuscate pas build release.
  - `useLegacyPackaging: true`: buat build APK internal (bukan lewat Play
    Store) - native library dikompres lagi di dalam APK, biasanya beberapa
    MB lebih kecil dibanding default SDK 54 (yang defaultnya nyimpen native
    lib gak terkompres demi startup time, gak relevan buat APK sideload).
- `eas.json` profile `preview` (yang kamu pakai buat `npm run build:apk`):
  env `ORG_GRADLE_PROJECT_reactNativeArchitectures: "arm64-v8a"` - ini yang
  PALING KERASA. Default React Native build APK "universal" isinya native
  library buat 4 arsitektur CPU sekaligus (arm64-v8a, armeabi-v7a, x86,
  x86_64) padahal HP kamu cuma butuh SATU (hampir semua HP Android modern
  arm64-v8a). Restrict ke 1 arsitektur ini biasanya motong APK jadi
  seperempatnya buat bagian native library.

### Catatan
- `expo-build-properties` juga punya opsi `android.buildArchs` yang
  KELIATANNYA buat hal yang sama - sengaja TIDAK dipakai karena ada laporan
  resmi di GitHub Expo (issue #38225) opsi itu gak konsisten kepake pas EAS
  build. Env var `ORG_GRADLE_PROJECT_reactNativeArchitectures` di eas.json
  adalah cara yang didokumentasikan Expo sendiri sebagai yang beneran jalan
  buat build di server EAS.
- Kalau nanti kamu perlu APK buat HP 32-bit lama, ganti value env di atas
  jadi `"arm64-v8a,armeabi-v7a"` (comma-separated, tanpa spasi).

## Fix Terpisah - `babel-preset-expo` Hilang dari package.json (2026-07-29)

Bug lama, gak ada hubungannya sama Fase 1-3 - baru ketauan pas `npm install`
bersih dijalanin (kemungkinan sebelumnya "nebeng" hoisted/cache
`node_modules` lama yang kebetulan masih ada paketnya). `babel.config.js`
project ini pakai `babel-preset-expo` tapi paketnya gak pernah didaftarin di
`devDependencies` - begitu `node_modules` di-reset, Metro gak nemu preset-nya
dan Babel gagal transform `expo-router` (error "Cannot find module
'babel-preset-expo'").

### Fixed
- `package.json`: tambah `"babel-preset-expo": "~54.0.0"` ke `devDependencies`
  (versi yang cocok buat Expo SDK 54 yang project ini pakai).





