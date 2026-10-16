# OVERHAUL PROGRESS — Yue Quiz

Pelacak pekerjaan overhaul. Diperbarui setiap kelompok perubahan selesai.
Status: `[ ]` belum, `[~]` sedang, `[x]` selesai, `[-]` dibatalkan/ditunda.

## P0 — Keamanan & bug kritis

- [x] P0.1 Hapus pendaftaran admin publik + endpoint admin-only (`POST /api/auth/accounts`) + UI panel admin
- [x] P0.2 Lindungi `results`/`roster`/`playerStates` dari penonton anonim
- [x] P0.3 Perbaiki `clientIp` / `TRUST_PROXY` (opt-in, sidik jari header, tanpa bucket global)
- [x] P0.4 Rate limit `join`/`answer`/`state` + `MAX_PLAYERS_PER_ROOM = 200`
- [x] P0.5 Tutup kebocoran `you.rank` mode exam
- [x] P0.6 Cabut sesi lain setelah ganti PIN (+ sesi baru untuk perangkat pengganti)
- [x] P0.7 CSP parsial + HSTS di middleware

## P1 — Bug fitur setengah jadi

- [x] P1.1 `instantFeedback` benar-benar tampil di mode live
- [x] P1.2 `explanation` di reveal live + `results.perQuestion`
- [x] P1.3 Navbar mobile (hamburger + drawer)
- [x] P1.4 Satukan validasi settings client/server
- [x] P1.5 Tombol host ganda dihapus

## P2 — Fitur pendukung

- [x] P2.1 Hapus unggahan + panel `ImageLibrary`
- [x] P2.2 Arsip sesi + halaman `/riwayat`

## P3 — Refactor & kualitas

- [x] P3.1 Ekstrak `OPTION_LETTERS` + `formatClock`
- [x] P3.2 Kontras + `color-scheme: dark`
- [x] P3.3 Pecah file monolitik
- [x] P3.4 Uji baru

## Putaran 2 — Refactor arsitektur

- [x] R1 `quiz-store.js` → `quiz-crypto` / `quiz-timing` / `quiz-derive` / `public-state`
- [x] R2 `globals.css` → `globals` + `styles/01-components` + `styles/02-features`
- [x] R3 `PlayClient.jsx` → `PlayDisplay` / `ExamResults` / `SeenQuestionsModal`
- [x] R4 `EditorClient.jsx` → `EditorModals`
- [x] R5 `self-test.mjs` → harness + fixtures + `tests/01..06`
- [x] R6 Aktifkan kembali aturan React hooks + perbaiki pelanggaran

## Putaran 3 — Fitur & konsistensi

- [x] T1 Filter template diperluas: `subject`, `gradeLevel`, `tag`, `facets=1` (SQL)
- [x] T2 Moderasi admin: `GET /api/templates?all=1` (khusus admin) + hapus dari panel
- [x] T3 Metadata template di editor: mata pelajaran, tag (chip), gambar sampul
- [x] T4 Komponen state bersama `AsyncState` (LoadingState/ErrorState)
- [x] T5 Halaman `/dashboard` per peran (guru / siswa / tamu)
- [x] T6 Landing page: keunggulan, FAQ, CTA band, footer, grid template

## Verifikasi (akhir putaran 3)

- [x] `npm run check` — 107 berkas lolos
- [x] `npm run self-test` — 58 lulus, 0 gagal (termasuk uji filter template baru)
- [x] `npm run lint` — 0 error, 0 warning
- [x] `npm run build` — sukses
- [x] E2E: metadata template, filter subject/tag/facets, moderasi admin (`all=1`
      → 403 untuk non-admin), halaman `/dashboard` 200

## Putaran 4 — Production readiness & UX

### Keamanan & gameplay
- [x] U1 CSP `script-src`/`style-src` `'unsafe-inline'` — memperbaiki hidrasi yang diblokir
- [x] U2 Klien menghormati `alreadyAnswered` + `lockedIndex` memprioritaskan jawaban server
- [x] U3 `leaderboard` & `players` tidak lagi bocor ke penonton anonim
- [x] U4 TTL room berbasis `lastActivityAt` (bukan `createdAt`)
- [x] U5 Grace period `ANSWER_GRACE_MS` (1200 ms) untuk latensi jaringan
- [x] U6 Timeout request tulis 15 detik (`AbortController`)
- [x] U7 Rate limit `POST /api/auth/pin`
- [x] U8 Filter tag meng-escape wildcard LIKE

### Production readiness
- [x] `engines.node >= 22.5.0`
- [x] `.env.example` (PUBLIC_BASE_URL, TRUST_PROXY, QUIZ_DB_PATH, NODE_ENV)
- [x] `npm run backup` (snapshot konsisten via `node:sqlite` backup)
- [x] `GET /api/health`
- [x] Dokumentasi deployment & pemulihan di README

### UX & aksesibilitas
- [x] `Modal` focus trap + fokus awal + pemulihan fokus
- [x] `.choice-card.is-selected` (pemilih peran terlihat)
- [x] Drawer mobile punya tautan "Masuk / Daftar"
- [x] OTP kode room tidak overflow di layar 360px
- [x] `:focus-visible` tidak lagi mengubah border-radius
- [x] Fokus input editor & chip waktu punya indikator
- [x] Target sentuh ≥44px pada pointer kasar
- [x] "Panel Admin" hanya untuk admin
- [x] Skeleton untuk tab Jelajahi + label "Memuat…" konsisten
- [x] Validasi klien form buat akun admin
- [x] Ekspor CSV per sesi di riwayat

### Verifikasi akhir
- [x] `npm run check` — 108 berkas lolos
- [x] `npm run self-test` — 63 lulus, 0 gagal
- [x] `npm run lint` — 0 error, 0 warning
- [x] `npm run build` — sukses
- [x] `npm run backup` — snapshot 64 KB berhasil
- [x] E2E: health, idempotensi jawaban, privasi anonim, arsip + detail, ekspor data

## Belum selesai / catatan jujur

- **Design system sebagai komponen React** (Button/Input/Select/dll) belum
  dibangun penuh; yang ada utility class CSS + beberapa komponen bersama
  (`AsyncState`, `Modal`, `ConfirmDialog`, `EmptyState`).
- **Drill-down jawaban pribadi per peserta** tidak bisa ditampilkan dari arsip:
  server memang tidak menyimpan pilihan jawaban tiap pemain per soal (hanya
  agregat `optionCounts` + benar/salah per pemain). Menampilkannya butuh
  perubahan skema yang direncanakan hati-hati (lihat rekomendasi Putaran 5).
- **Ekspor CSV** kini tersedia per sesi (per pemain + per soal). Belum ada
  ekspor massal semua sesi.
- **Dark mode terang** belum ada; aplikasi sengaja dark-only.
- **Landing page** memakai ikon SVG inline (tanpa font emoji). Data
  `CATEGORY_MAP.icon` emoji tetap ada sebagai data, tidak dirender di UI
  beranda (NavBar, form gabung, kartu template, empty state = nol emoji).
- **`'unsafe-inline'` pada CSP** adalah kompromi; nonce per-request belum
  dipasang.
- **Rate limit berbasis sidik jari header** (tanpa `TRUST_PROXY`) bisa
  dilewati dengan mengganti User-Agent; IP asli butuh reverse proxy.

## Risiko yang tersisa

- **State room in-memory**: restart server = semua sesi berjalan hilang. Tidak
  bisa multi-instance. Sudah didokumentasikan; butuh Redis/DB bila ingin HA.
- **Akun admin demo PIN publik** di-seed saat DB kosong. Di produksi, ganti PIN
  admin segera atau hapus akun demo.
- **Unggahan gambar publik tanpa kontrol akses** (nama 32-hex sulit ditebak,
  tapi bukan otorisasi).
- **CSP `'unsafe-inline'`** melemahkan pertahanan XSS (mitigasi: React escaping
  + tidak ada `dangerouslySetInnerHTML`).

## Rekomendasi Putaran 5 (load/stress test & peluncuran)

1. **Load & stress test**: uji 200 pemain/room (batas), 50 room bersamaan,
   polling 1 detik × jumlah klien. Ukur CPU/memori `closeExpiredQuestions()`
   dan latensi `GET /state`. Siapkan skrip k6/autocannon.
2. **Multi-instance**: evaluasi pindah state room ke Redis agar bisa horizontal
   scaling dan tidak hilang saat restart.
3. **Nonce CSP**: hapus `'unsafe-inline'` dengan nonce per-request.
4. **Observability**: log terstruktur + metrik (jumlah room, error rate).
5. **Graceful shutdown**: `SIGTERM` → `wal_checkpoint(TRUNCATE)` + tutup DB.
6. **Backup terjadwal**: cron `npm run backup` + retensi.
7. **Drill-down jawaban pribadi**: tambah kolom jawaban per pemain di arsip
   (atau tabel `room_answers_archive`) dengan migrasi hati-hati.
8. **Rate limit berbasis IP asli** dengan panduan reverse proxy.

## Putaran 5 — Hardening keamanan runtime

- [x] H1 Rate limit aksi host per IP (120/menit, 9 rute host)
- [x] H2 Perbandingan token konstan-waktu (`timingSafeEqual`)
- [x] H3 CSP berbasis nonce; `script-src` tanpa `'unsafe-inline'`
- [x] H4 `style-src-elem` tanpa `'unsafe-inline'` (tag `<style>`/`<link>` ber-nonce)
- [-] H5 Ekstraksi ±350 atribut `style=` ke CSS → `style-src-attr` bisa ditutup (ditunda; refactor visual besar)
- [-] H6 Externalisasi state room (butuh dependensi/infra baru; perlu persetujuan)

Verifikasi: `self-test` 78/78 · `check` 113 berkas · `lint` 0 · `build` sukses ·
smoke produksi: semua `<script>` ber-nonce, nonce header = nonce body, `<link>` CSS 200.
