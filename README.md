# Yue Quiz — README

Kuis multiplayer real-time + mode ujian mandiri untuk kelas. Dibuat dengan
Next.js 16 + React 19, **tanpa dependensi tambahan** selain keempat paket resmi
di `package.json`. Semua state permainan hidup di memori server; SQLite
(`data/quiz.db`) hanya untuk akun, template, unggahan, dan arsip sesi.

## Menjalankan

```bash
npm ci            # pasang dari lockfile (tanpa unduhan tambahan)
npm run dev       # http://localhost:3500
npm run build && npm start   # produksi, juga di port 3500
npm run backup    # salinan konsisten data/quiz.db → data/backups/
```

Aplikasi **selalu** jalan di port **3500** (CONTRACT §9).

**Node 22.5+ wajib** (`engines` di `package.json`): aplikasi memakai modul
bawaan `node:sqlite`.

## Konfigurasi produksi

Lihat **`.env.example`**. Ringkasnya:

| Variabel | Fungsi |
|---|---|
| `PUBLIC_BASE_URL` | URL publik (mis. `https://quiz.contoh.sch.id`). Dipakai untuk link host/play absolut & HSTS. **Wajib di produksi.** |
| `TRUST_PROXY` | Setel `1` HANYA bila di belakang reverse proxy tepercaya. |
| `QUIZ_DB_PATH` | Lokasi SQLite. Arahkan ke volume persisten di container. |
| `NODE_ENV` | `production` mengaktifkan cookie `Secure` **dan mematikan seeding akun demo**. |
| `QUIZ_SEED_DEMO` | Paksa seeding akun demo: `1` (selalu) / `0` (jangan). Default: seed hanya bila `NODE_ENV !== production`. |

Pemeriksaan kesehatan: `GET /api/health` → `{ ok, uptimeSec, rooms }`.

**Backup:** jalankan `npm run backup` secara berkala (cron). Perintah ini memakai
API backup `node:sqlite` sehingga menghasilkan snapshot konsisten meski ada
penulisan berjalan. Pemulihan: hentikan server, ganti `data/quiz.db` dengan
berkas backup, lalu jalankan lagi.

> **Penting:** folder `data/` (DB + unggahan) harus berada di penyimpanan
> persisten. Di platform ephemeral, data akan hilang setiap redeploy.

## Peran & alur

| Peran | Bisa apa |
|---|---|
| **Guru / Admin** | Membuat kuis, menyimpan template, memainkan sebagai host, melihat laporan & CSV. |
| **Siswa** | Mengikuti kuis lewat kode 6 huruf, melihat nilai sendiri, menyimpan template. |
| **Tamu** | Main & membuat draft tanpa akun — draft tersimpan di browser ini saja. |

Alur singkat:

1. `/editor/new` → buat dari nol, impor teks/CSV, atau salin template.
2. Editor → atur mode & aturan (live/ujian, batas waktu, penilaian), gambar soal,
   notasi matematika, penjelasan.
3. **▶ Mainkan** → room dibuat, host mendapat `/host/{code}` dan link `/play/{code}`.
4. Bagikan kode 6 huruf (atau QR) → pemain bergabung → host menekan **Mulai Kuis**.

## Mode

- **Live (serempak)** — fase `lobby → question → reveal → finished`, dikendalikan
  host. Ada distribusi jawaban, bonus kecepatan, dan papan skor antar soal.
- **Ujian (mandiri)** — tiap pemain punya indeks & batas waktunya sendiri.
  Tidak ada pembahasan di tengah. Nilai akhir `benar ÷ jumlah soal × 100`,
  lulus bila `≥ passingScore`. Layar akhir memuat pembahasan per soal dan
  host mendapat rekap per pemain + ekspor CSV.

Batas waktu: `per-question` (per soal) · `random` (server mengundi sekali di
awal) · `total` (satu batas per pemain) · `none`.

## Notasi matematika

Tulis apa adanya di teks soal & opsi:

| Tulis | Jadi |
|---|---|
| `3/4`, `2 1/2` | pecahan & bilangan campuran |
| `sqrt(3)`, `√3`, `root(3)(8)` | akar (kuadrat & berpangkat) |
| `x^2`, `x^(n+1)`, `_1` | pangkat & indeks |
| `|x|` | nilai mutlak |
| `<= >= != +- * xx pi theta deg` | ≤ ≥ ≠ ± × π θ ° |

`12/03/2026`, `dan/atau`, `a/b/c`, dan URL **tetap teks biasa** — pecahan hanya
dikenali kalau polanya satu kata utuh. Editor menyediakan palet simbol dan
tombol **"lihat sebagai teks biasa"** untuk memeriksa apa yang benar-benar
tersimpan. Rincian aturan & penyimpangan ada di `CONTRACT-DEVIATIONS.md`.

## Port & endpoint

Semua endpoint mengikuti `CONTRACT.md` (§3 auth, §4 uploads, §5 templates,
§6 rooms). Contoh cepat:

```bash
curl -s localhost:3500/api/auth/me
curl -s -X POST localhost:3500/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"name":"Bu Rina","pin":"123456"}'
curl -s -X POST localhost:3500/api/rooms \
  -H 'content-type: application/json' \
  -d '{"title":"Latihan","questions":[{"text":"3/4 + 1/8?","options":["7/8","1/2","4/12","3/2"],"correctIndex":0,"timeSec":30}]}'
curl -s -X POST localhost:3500/api/rooms/ABC123/end \
  -H 'content-type: application/json' -d '{"hostToken":"…"}'
```

Akun demo (di-seed sekali saat database masih kosong, PIN semuanya `123456`):
`Admin Yue` (admin) · `Bu Rina` (guru) · `Budi`/`Sari` (siswa 7A) ·
`Rudi` (7B) · `Nina` (8A).

> **Akun demo tidak muncul di produksi.** Seeding akun demo (PIN bawaan yang
> mudah ditebak) hanya berjalan bila `NODE_ENV !== "production"`. Untuk memaksa
> di lingkungan demo, setel `QUIZ_SEED_DEMO=1`; untuk mematikan di mana pun,
> setel `QUIZ_SEED_DEMO=0`.

## Halaman utama

| Rute | Isi |
|---|---|
| `/` | Landing: hero, cara kerja, template pilihan, gabung, keunggulan, FAQ. |
| `/dashboard` | Pusat aktivitas — tampil beda untuk guru, siswa, dan tamu. |
| `/templates` | Perpustakaan template: cari + filter kategori/mapel/jenjang/tag. |
| `/my-quizzes` | Draft & template milik sendiri (lokal + server). |
| `/riwayat` | Arsip sesi yang sudah selesai (guru: miliknya, admin: semua). |
| `/editor/[id]` | Editor 3-pane + panel kelola gambar + simpan template. |
| `/host/[code]`, `/play/[code]` | Layar host & pemain. |
| `/admin` | Panel admin: akun, moderasi template, pembuatan akun. |

Filter template dikirim ke server (`?subject=`, `?gradeLevel=`, `?tag=`,
`?facets=1`), bukan disaring di klien.

Ikon beranda memakai SVG inline (`src/components/HomeIcons.jsx`), bukan font
emoji — NavBar, form gabung, kartu template, dan empty state tetap terbaca
tanpa font emoji.

## Batasan yang diketahui — jujur

- **State room ada di memori.** Server restart = semua room hilang. Aplikasi
  tidak bisa dijalankan multi-instance (dua proses Node tidak saling melihat).
  Mengeksternalkan state (Redis/pub-sub) sengaja **tidak** dilakukan: itu
  menuntut dependensi + infrastruktur baru, di luar batasan "tanpa dependensi
  tambahan". Jalur naiknya bila dibutuhkan: ganti Map di `quiz-store.js` dengan
  adapter yang membaca/menulis ke store bersama (Redis hash + TTL, atau tabel
  SQLite dengan busy-timeout), dan pindahkan bucket rate limit di
  `src/lib/http.js` ke store yang sama supaya batasnya tetap berlaku lintas
  proses. Sampai itu ada, jalankan **satu instance** (`pm2 start ... -i 1` /
  satu replika).
- **Room kedaluwarsa setelah 3 jam** (dibersihkan malas saat ada request).
- **Anti-inspect mode ujian bersifat isyarat UI, bukan pengaman.** Yang benar-
  benar ditegakkan server: `correctIndex` tidak dikirim sebelum waktunya, dan
  tidak ada state ujian di `localStorage`/`sessionStorage`. Yang HANYA isyarat:
  menu konteks dinonaktifkan, cookie sesi httpOnly. Siapa pun yang membuka
  DevTools tetap bisa melihat teks soal yang sedang tampil — itu memang harus
  terlihat oleh pemain.
- **Daftar akun hanya bisa dibaca admin**, jadi halaman masuk tidak bisa tahu
  berapa akun yang ada sebelum ada yang masuk sebagai admin. Petunjuk akun demo
  karena itu ditampilkan sampai admin melihat jumlah akun yang sebenarnya.
- **Akun admin tidak bisa didaftarkan sendiri.** Registrasi publik hanya
  menerima peran guru/siswa; admin baru dibuat admin yang sudah ada lewat
  panel admin (`POST /api/auth/accounts`).
- **PNG/JPG/GIF/WebP saja**, maks 2,5 MB per gambar, 100 gambar per akun.
  Gambar bisa dihapus lewat panel "Kelola Gambar" di editor.
- **Riwayat sesi** (`/riwayat`) dibaca dari arsip SQLite; guru melihat miliknya
  sendiri, admin melihat semua. Sesi diarsipkan otomatis saat berakhir.
- **`TRUST_PROXY` bersifat opt-in.** Tanpa menyetel `TRUST_PROXY=1`, header
  `X-Forwarded-For` diabaikan dan rate limit memakai sidik jari header klien.
  Setel `TRUST_PROXY=1` HANYA bila aplikasi berada di belakang reverse proxy
  tepercaya yang menulis header itu.
- **Template bawaan** dipecah dua berkas: `src/lib/templates-data.js` (klien —
  hanya kategori + ringkasan kartu, **tanpa kunci jawaban**) dan
  `src/lib/templates-data.server.js` (server — data lengkap + `correctIndex`,
  dijaga `server-guard`). Kunci jawaban template bawaan **tidak** ikut ke bundel
  klien; klien mengambilnya lewat `GET /api/templates/builtin/[id]` hanya saat
  pengguna memilih memakai/menyalin/memainkan template.

## Penyimpangan dari kontrak

Lengkapnya di **`CONTRACT-DEVIATIONS.md`** (bagian "UI", "SERVER", "Perubahan
overhaul", dan "Refactor putaran 2"). Ringkasan sisi UI: bentuk token `parseMath`
bersarang, pecahan berspasi hanya aktif bila teks memuat satu garis miring,
`lim/sum/int` tidak dapat token khusus, `listPublicAccounts()`/`accountCount()`
mengembalikan cache karena daftar akun server khusus admin, jawaban pribadi mode
ujian hidup di memori (bukan storage), `allowBack` hanya bisa membaca ulang soal,
dan `/templates/[id]` melayani template bawaan maupun template server. Sisi
server: `src/lib/pin.js` (kripto PIN dipisah), `score`/`tally`/`rank` dihilangkan
dari balasan/polling mode ujian selama umpan balik mati (anti-bocor),
`currentIndex` = indeks penonton di mode ujian, `MAX_TEMPLATE_BODY_BYTES`, dan
arsip otomatis.

## Struktur modul inti

`src/lib/quiz-store.js` (mesin room) sudah dipecah agar tiap bagian punya
tanggung jawab jelas:

| Berkas | Isi |
|---|---|
| `quiz-store.js` | siklus hidup room (create/join/start/answer/end/…) |
| `public-state.js` | `publicState` — satu-satunya pintu keluar data ke klien |
| `quiz-derive.js` | distribusi, rekap, hasil, aturan anti-bocor skor/peringkat |
| `quiz-timing.js` | semua keputusan deadline |
| `quiz-crypto.js` | kode room, token, pengacakan |
| `secure-compare.js` | `safeEqual` — banding token waktu-konstan (Node-only) |
| `host-actions.js` | rate limit bersama untuk semua aksi host |
| `quiz-validate.js` | konstanta & validasi (dipakai server + klien) |
| `scoring.js` | rumus poin, nilai, peringkat |

CSS dipecah di `src/app/globals.css` (token + base) dan `src/app/styles/`
(`01-components.css`, `02-features.css`). Uji server ada di `scripts/self-test.mjs`
(runner) + `scripts/tests/01..08-*.mjs` (per domain: penilaian, unggahan,
validasi, DB, store room, overhaul, kebocoran kunci jawaban template bawaan,
pengamanan — rate limit host/token/CSP).

## Pengujian & kesiapan produksi

```bash
npm test          # = node scripts/self-test.mjs (suite uji server, DB sementara)
npm run check     # pemeriksaan sintaks semua berkas sumber
npm run lint      # ESLint
npm run build     # build produksi
```

Suite uji memakai berkas SQLite sementara (`QUIZ_DB_PATH`) dan **tidak menyentuh**
`data/quiz.db`. Gagal uji → exit code non-nol (aman untuk CI).

Saat menaikkan ke produksi, pastikan: `NODE_ENV=production`,
`PUBLIC_BASE_URL` disetel ke URL https publik, aplikasi dijalankan **single
instance** (state room ada di memori), `data/` di volume persisten, dan
`npm run backup` dijadwalkan. Seeding akun demo otomatis mati di produksi
(lihat bagian akun demo).

## Keamanan runtime

- **CSP berbasis nonce.** `src/middleware.js` membangkitkan nonce acak tiap
  request, mengirimkannya lewat header CSP pada *request* (cara Next.js
  menempelkan nonce ke `<script>`/`<style>` inline-nya), lalu menegakkan CSP
  pada respons. `script-src` memuat `'self' 'nonce-…' 'strict-dynamic'` —
  **tanpa `'unsafe-inline'`**. Karena nonce menonaktifkan optimasi statis,
  halaman yang tadinya dirender statis (mis. `/`, `/masuk`, `/dashboard`)
  diberi `export const dynamic = "force-dynamic"`. Gaya dipecah (CSP Level 3):
  `style-src-elem` (tag `<style>`/`<link>`) memakai nonce **tanpa**
  `'unsafe-inline'`, sedangkan `style-src-attr 'unsafe-inline'` tetap diizinkan
  karena ±350 atribut `style=` statis belum diekstrak ke class CSS (nonce tidak
  bisa dipasang ke atribut). Menutup `<style>` injeksi; mengekstrak atribut
  `style=` ke CSS adalah langkah lanjutan. Browser turunan Chrome <60 (yang tidak
  mengenal nonce dan akan memblokir semua script) mendapat varian CSP longgar
  lama via deteksi User-Agent.
- **Rate limit aksi host.** `start/next/skip/end/lock/kick/restart/extend/advance`
  dibatasi 120 aksi/menit per IP (`src/lib/host-actions.js`, `LIMITS.hostAction`
  di `src/lib/http.js`). Aksi ini menuntut token host, jadi batasnya murni
  menahan spam/brute-force, bukan memutus alur host.
- **Perbandingan token waktu-konstan.** Token host & pemain dibandingkan lewat
  `safeEqual` (`node:crypto.timingSafeEqual`, `src/lib/secure-compare.js`),
  bukan `===`, agar tidak membocorkan panjang kecocokan lewat waktu eksekusi.
- **Header lain**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `frame-ancestors 'none'` (anti-clickjacking —
  halaman host memegang token host), dan HSTS hanya bila `PUBLIC_BASE_URL`
  memakai `https://`.

---

## Kebijakan komentar kode

Default NOL komentar baru; hanya WHY non-obvious (`code-comment-cleanup-policy`, mode guard).
