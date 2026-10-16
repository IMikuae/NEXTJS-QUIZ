# KONTRAK API & KEPUTUSAN DESAIN — Yue Quiz (v2)

> **File ini BEKU.** Ditulis sebelum implementasi dimulai. Dua agent bekerja paralel:
> satu memegang lapisan server (`src/lib/*.js` inti + `src/app/api/**`), satu memegang
> lapisan UI (`src/app/**/*.jsx`, `src/components/**`, `globals.css`, lib klien).
> Keduanya WAJIB mengikuti kontrak ini persis. Kalau sebuah agent merasa kontrak ini
> salah, ia boleh menyimpang TAPI harus menulis alasannya di README bagian
> "Penyimpangan dari kontrak" — jangan diam-diam berbeda.

---

## 0. Aturan yang tidak boleh dilanggar

1. **Tanpa unduhan.** Tidak ada `npm install`, `npm i`, `npx`, atau apa pun yang
   menyentuh internet. Dependency tetap: `next@16.2.10`, `react@19.2.4`,
   `react-dom@19.2.4`, `@heroicons/react@2.2.0`. Modul Node bawaan (`node:sqlite`,
   `node:crypto`, `node:fs`, `node:path`, `node:dns`) **boleh** — itu bukan unduhan.
2. **`correctIndex` tidak pernah bocor** kecuali: (a) fase `reveal`/`finished`,
   (b) respons privat `POST /answer` ke pemain yang sudah menjawab. Aturan ini
   berlaku di **semua mode**, termasuk mode ujian.
3. **Mode ujian tidak menyimpan jawaban di browser.** Tidak ada
   `localStorage`/`sessionStorage` yang memuat indeks jawaban benar, status
   benar/salah, atau progres per soal selagi ujian berjalan. Progres hidup di
   server; klien hanya menampilkan hasil polling.
4. **Semua route yang menyentuh SQLite wajib** `export const runtime = "nodejs"`.
5. **Bahasa UI: Indonesia.** Error API: `{ error: "pesan ramah berakhir titik." }`,
   tanpa stack trace / path.

---

## 1. Mode & pengaturan — kosakata bersama

```js
settings = {
  mode: "live" | "exam",              // default "live"
  timeMode: "per-question" | "random" | "total" | "none",
  defaultTimeSec: 30,                 // dipakai timeMode "per-question" & "random"
  randomMinSec: 10, randomMaxSec: 60, // dipakai timeMode "random"
  totalTimeSec: 600,                  // dipakai timeMode "total"
  scoringMode: "competitive" | "exam",
  instantFeedback: false,             // pemain langsung lihat benar/salah
  showExplanation: false,             // tampilkan penjelasan setelah menjawab
  shuffleQuestions: false,
  shuffleOptions: false,
  passingScore: 70,                   // 0–100, hanya scoringMode "exam"
  allowBack: false,                   // mode ujian: boleh kembali ke soal sebelumnya
}
```

**Arti tiap `timeMode`:**

| timeMode | Perilaku |
|---|---|
| `per-question` | Setiap soal memakai `question.timeSec` bila ada, kalau tidak `defaultTimeSec`. |
| `random` | Server mengundi detik tiap soal dari `[randomMinSec, randomMaxSec]` SEKALI saat kuis dimulai, lalu hasilnya dikunci di `room.questions[i].timeSec`. Host melihat hasil undian. |
| `total` | Tidak ada batas per soal. Satu batas untuk seluruh kuis (`totalTimeSec`), dihitung per pemain sejak ia mulai. |
| `none` | Tanpa batas waktu sama sekali. Kuis hanya berakhir kalau host menutup atau semua soal habis. |

**Arti tiap `mode`:**

- **`live`** — perilaku yang SUDAH ADA, jangan diubah: satu soal untuk semua orang,
  host yang menekan "Soal Berikutnya", fase `reveal` menampilkan distribusi.
- **`exam`** — **self-paced per pemain.** Setiap pemain punya `index` dan `deadline`
  sendiri. Tidak ada fase `reveal` di tengah ujian. Soal habis waktu → jawaban
  tercatat sebagai kosong → otomatis lanjut. `instantFeedback` boleh dinyalakan:
  begitu menjawab, pemain langsung melihat benar/salah lalu otomatis lanjut.

**Arti tiap `scoringMode`:**

| scoringMode | Poin |
|---|---|
| `competitive` | Rumus lama: `1000 + round(1000 × sisa/total)` untuk jawaban benar, 0 untuk salah. |
| `exam` | `1` poin per jawaban benar. Nilai akhir = `round(benar / totalSoal × 100)`. Lulus bila `≥ passingScore`. |

Di `scoringMode: "exam"`, bonus kecepatan **tidak dihitung sama sekali**.

---

## 2. Skema database (SQLite via `node:sqlite`)

File: `data/quiz.db`. Dibuat otomatis. Pola migrasi sama seperti proyek `shorturl`:
`db.prepare("PRAGMA table_info(x)").all()` → `ALTER TABLE ... ADD COLUMN` bila belum ada.

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL COLLATE NOCASE,
  role          TEXT NOT NULL,              -- guru | siswa | admin
  kelas         TEXT,                       -- hanya untuk siswa
  pin_hash      TEXT NOT NULL,              -- "saltHex:hashHex" (scrypt, 64 byte)
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     TEXT,
  subject      TEXT,
  grade_level  TEXT,
  tags         TEXT,                        -- JSON array string
  cover_image  TEXT,
  visibility   TEXT NOT NULL DEFAULT 'private',  -- private | public
  settings     TEXT NOT NULL,               -- JSON objek settings di atas
  questions    TEXT NOT NULL,               -- JSON array soal
  clone_count  INTEGER DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_templates_owner ON templates(owner_id);
CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(visibility, updated_at DESC);

CREATE TABLE IF NOT EXISTS uploads (
  id         TEXT PRIMARY KEY,              -- 32 hex
  owner_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ext        TEXT NOT NULL,                 -- png | jpg | gif | webp
  bytes      INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms_archive (
  code        TEXT PRIMARY KEY,
  host_user   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title       TEXT,
  mode        TEXT,
  settings    TEXT,                         -- JSON
  summary     TEXT,                         -- JSON: hasil akhir + rekap per soal
  player_count INTEGER,
  started_at  DATETIME,
  ended_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Akun demo lama (`Admin Yue`, `Bu Rina`, `Budi`, `Sari`, `Rudi`, `Nina`, PIN `123456`)
di-seed **sekali** saat tabel `users` masih kosong, supaya halaman masuk tetap bisa
dicoba. Kelas tetap `["7A","7B","8A","8B","9A","9B"]`.

---

## 3. Autentikasi

Hashing: `scryptSync(pin, salt, 64)`, disimpan `"<saltHex>:<hashHex>"` — **sama persis**
dengan pola `shorturl/src/lib/auth.js`. Cookie: `yq_session`, token 32 byte hex acak
disimpan di tabel `sessions`, opsi `{ httpOnly: true, sameSite: "lax", path: "/",
maxAge: 30 hari, secure: NODE_ENV === "production" }`.

| Method | Path | Auth | Body | Respons |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | — | `{ name, pin, role, kelas? }` | `201 { ok, user }` |
| `POST` | `/api/auth/login` | — | `{ name, pin }` | `200 { ok, user }` |
| `POST` | `/api/auth/logout` | cookie | — | `200 { ok }` |
| `GET` | `/api/auth/me` | opsional | — | `200 { user: User\|null }` |
| `PATCH` | `/api/auth/me` | wajib | `{ name }` | `200 { ok, user }` |
| `POST` | `/api/auth/pin` | wajib | `{ currentPin, newPin }` | `200 { ok }` |
| `GET` | `/api/auth/accounts` | admin | — | `200 { accounts: User[] }` |
| `DELETE` | `/api/auth/accounts/[id]` | admin | — | `200 { ok }` |

`User` = `{ id, name, role, kelas, createdAt }` — **tidak pernah** memuat `pin_hash`.

Aturan validasi (dipakai server DAN klien, cermin):
- `name`: 2–20 karakter, unik tanpa peduli huruf besar/kecil.
- `pin`: tepat 6 digit angka.
- `role`: salah satu `guru|siswa|admin`.
- `kelas`: wajib bila `role === "siswa"`, harus salah satu dari daftar kelas.
- Login: pesan gagal SELALU `"Nama atau PIN tidak cocok."` (jangan bocorkan mana yang salah).
- `newPin` pada ganti PIN: 6 digit, dan **tidak boleh sama** dengan PIN lama.
- Rate limit login/register: 10 percobaan / menit / IP (pakai `consume()` di `http.js`).

`src/lib/auth-store.js` (klien) **berubah dari penyimpan localStorage menjadi pemanggil
API ini**, tapi `useAuth()`, `currentOwnerId()`, `ROLES`, `KELAS_OPTIONS`, `PIN_LENGTH`,
dan `DEMO_PIN_HINT` **tetap diekspor dengan bentuk yang sama** supaya `NavBar`,
`MasukClient`, `AdminClient`, `MyQuizzesClient`, dan `EditorClient` tidak perlu tahu
bahwa backendnya pindah. `useAuth()` mengembalikan `{ user, loaded }`; saat pertama kali
`GET /api/auth/me` dipanggil dan hasilnya `null` → `{ user: null, loaded: true }`.
Akun di localStorage lama **tidak perlu dimigrasikan** — cukup diabaikan.

---

## 4. Unggahan gambar

**Tanpa dependency.** Body JSON berisi data URL base64.

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| `POST` | `/api/uploads` | wajib | Body `{ data: "data:image/png;base64,…" }`, maks **2,5 MB** setelah decode, maks 5 MB body. Balas `201 { url, width, height }`. |
| `GET` | `/api/uploads/[file]` | — | Menyajikan berkas dengan `Cache-Control: public, max-age=31536000, immutable`. |

- Berkas ditulis ke `data/uploads/<id>.<ext>`; baris `uploads` dicatat di DB.
- Ekstensi ditentukan dari **magic bytes**, bukan dari string data URL:
  `89 50 4E 47` → png · `FF D8 FF` → jpg · `47 49 46 38` → gif ·
  `52 49 46 46` + `57 45 42 50` di offset 8 → webp. Selain itu → `400`.
- `width`/`height` dibaca dari header PNG (IHDR), JPEG (SOF), GIF, atau WebP (VP8X/VP8/VP8L).
  **Tanpa dependency** — parser minimal ditulis sendiri di `src/lib/uploads.js`.
- Nama berkas di URL **hanya boleh** `[a-f0-9]{32}\.(png|jpg|gif|webp)` — tolak apa pun
  selain itu dengan 404 (mencegah path traversal).
- Batas per user: 100 gambar. Lebih dari itu → `429`.

Gambar dipakai untuk: `question.image` (gambar soal) dan `question.optionImages[0..3]`
(gambar per opsi, boleh `null`). Semuanya **URL** (`/api/uploads/…`), bukan base64,
supaya payload room tetap kecil.

---

## 5. Template

**Semua operasi tulis wajib login.** `GET` publik hanya untuk `visibility: "public"`.

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| `GET` | `/api/templates?q=&category=&mine=1` | opsional | `mine=1` wajib login; mengembalikan template milik sendiri (termasuk privat). Tanpa `mine` → hanya publik. |
| `POST` | `/api/templates` | wajib | Buat. Balas `201 { template }`. |
| `GET` | `/api/templates/[id]` | opsional | Privat hanya untuk pemilik. Selain itu `404`. |
| `PUT` | `/api/templates/[id]` | wajib | Ganti. Hanya pemilik. |
| `DELETE` | `/api/templates/[id]` | wajib | Hapus. Hanya pemilik. |
| `POST` | `/api/templates/[id]/clone` | wajib | Salin jadi milik pemanggil, `clone_count += 1`. Balas `201 { template }`. |

**Bentuk `Template`:**

```jsonc
{
  "id": 1,
  "ownerId": 2, "ownerName": "Bu Rina",
  "title": "Pecahan & Akar",
  "description": "Latihan bab 3",
  "category": "Matematika",
  "subject": "Matematika", "gradeLevel": "8A",
  "tags": ["pecahan", "akar"],
  "coverImage": "/api/uploads/…" ,
  "visibility": "private",
  "cloneCount": 0,
  "mine": true,
  "createdAt": "…", "updatedAt": "…",
  "settings": { /* objek di bagian 1 */ },
  "questions": [
    {
      "text": "Hasil dari 3/4 + 1/8 adalah …",
      "options": ["7/8", "1/2", "4/12", "3/2"],
      "correctIndex": 0,
      "timeSec": 30,
      "image": null,
      "optionImages": [null, null, null, null],
      "explanation": "Samakan penyebut: 6/8 + 1/8 = 7/8."
    }
  ]
}
```

Batas: `title` ≤ 80, `description` ≤ 300, `questions` 1–100, `text` ≤ 500,
`options` tepat 4, tiap opsi ≤ 200, `explanation` ≤ 500, `tags` ≤ 8 tag @ ≤ 20 karakter.

---

## 6. Room (kuis berjalan)

`POST /api/rooms` sekarang menerima:

```jsonc
{
  "title": "…",
  "questions": [ /* bentuk soal di atas; timeSec opsional, image/optionImages/explanation opsional */ ],
  "settings": { /* bagian 1; semua field opsional, diisi default */ }
}
```

Balasan `201` **tidak berubah**: `{ code, hostToken, hostUrl, playUrl }`.

Endpoint yang sudah ada, **kontraknya tidak berubah**: `join`, `start`, `state`,
`answer`, `next`, `extend`, `skip`.

**Endpoint baru** (semua `hostToken`, semua membalas `{ ok: true, version }`):

| Method | Path | Body | Efek |
|---|---|---|---|
| `POST` | `/api/rooms/[code]/end` | — | Akhiri sesi SEKARANG dari fase apa pun → `phase: "finished"`. Hasil akhir dihitung & diarsipkan ke `rooms_archive`. |
| `POST` | `/api/rooms/[code]/kick` | `{ playerId }` | Keluarkan pemain. Tokennya langsung tidak berlaku. Fase apa pun. |
| `POST` | `/api/rooms/[code]/lock` | `{ locked: bool }` | Kunci/buka lobby. Saat terkunci, `join` → `409 "Room sedang dikunci host."` |
| `POST` | `/api/rooms/[code]/restart` | — | Reset skor & jawaban semua pemain, kembali ke `lobby`, `version += 1`. Soal tetap. |
| `POST` | `/api/rooms/[code]/advance` | — | Mode `live` saja: paksa lanjut ke soal berikutnya walau waktu masih jalan (setara `next` tapi selalu diizinkan). Mode `exam` → `409`. |

### `publicState` — tambahan

Field lama **tidak berubah nama maupun artinya**. Yang ditambah:

```jsonc
{
  "mode": "live" | "exam",
  "settings": { /* objek settings, tanpa rahasia */ },
  "question": {
    "index": 0, "text": "…", "options": ["…"], "timeSec": 30,
    "image": "/api/uploads/…" | null,
    "optionImages": [null, null, null, null],
    "totalQuestions": 20            // untuk indikator "Soal 3 dari 20"
  },
  "progress": { "answered": 3, "total": 20, "score": 3 },   // milik penonton sendiri
  "totalSecondsLeft": 412,          // hanya timeMode "total" & "none" → null
  "playerStates": [                 // hanya mode exam, untuk layar host
    { "id": "…", "name": "Budi", "index": 4, "answered": 4, "total": 20, "finished": false }
  ],
  "results": null                   // hanya saat "finished"
}
```

Saat `phase === "finished"`, `results` berisi:

```jsonc
{
  "passingScore": 70,
  "perPlayer": [
    { "playerId": "…", "name": "Budi", "rank": 1,
      "correct": 17, "wrong": 2, "unanswered": 1, "total": 20,
      "score": 17, "grade": 85, "passed": true,
      "secondsUsed": 431 }
  ],
  "myResult": { /* sama, untuk penonton pemain; null untuk host/anonim */ },
  "perQuestion": [
    { "index": 0, "text": "…", "correctIndex": 0,
      "answeredCount": 20, "correctCount": 15, "correctPercent": 75,
      "skipped": false, "optionCounts": [15, 3, 1, 1] }
  ],
  "averageGrade": 78.5
}
```

`distribution` pada `reveal` mode `live` **tetap** seperti sekarang.

### `POST /answer` — tambahan pada balasan sukses

```jsonc
{
  "ok": true, "alreadyAnswered": false,
  "correct": true, "points": 1, "score": 3,
  "correctIndex": 0,
  "explanation": "…" | null,
  "progress": { "answered": 3, "total": 20 },
  "nextIndex": 3 | null,        // soal berikutnya bagiku (mode exam), null bila habis
  "finished": false,            // true bila ini jawaban terakhirku
  "tally": { "correct": 3, "wrong": 1, "unanswered": 0 },
  "distribution": [1,0,0,0]     // hanya mode live (perilaku lama)
}
```

`correctIndex` dan `explanation` **hanya** dikirim bila `settings.instantFeedback`
atau `settings.showExplanation` menyala, ATAU mode `live` (perilaku lama). Di mode
`exam` dengan keduanya mati, balasan hanya berisi `{ ok, alreadyAnswered, progress,
nextIndex, finished }` — **tanpa** benar/salah.

### Mesin mode `exam`

Per pemain: `index`, `deadline` (timestamp ms; `null` untuk `timeMode: "none"`),
`startedAt`, `finishedAt`, `correctCount`, `wrongCount`, `unansweredCount`.

- `start` menginisialisasi tiap pemain: `index = 0`, `startedAt = now`,
  dan `deadline`:
  - `per-question`/`random` → `now + questions[0].timeSec * 1000`
  - `total` → `now + settings.totalTimeSec * 1000`
  - `none` → `null`
- `answer` mencatat jawaban pada `(playerId, player.index)`, lalu bila
  `instantFeedback` ATAU balasan langsung, `index += 1` dan `deadline` di-set ulang
  mengikuti soal baru. Bila `index >= questions.length` → pemain itu `finished`.
- Sapuan `closeExpiredQuestions()` diperluas: di mode `exam`, pemain yang
  `deadline`-nya lewat langsung dicatat **tidak menjawab**, `index += 1`, lanjut;
  soal terakhir lewat → pemain `finished`. Fase room menjadi `finished` saat
  **semua** pemain `finished` (atau host menekan `end`).
- `next`, `extend`, `skip`, `advance` → `409` di mode `exam` (tidak berlaku).

### Mode `live` — jangan diubah

Fase `lobby → question → reveal → finished`, `currentIndex` bersama, host yang
menggerakkan. Yang ditambah hanya: `end`, `kick`, `lock`, `restart`, `advance`,
`instantFeedback` (pemain melihat benar/salah segera setelah menjawab, tapi fase
tetap `question` sampai host lanjut), dan `scoringMode: "exam"` (tanpa bonus kecepatan).

---

## 7. Render matematika (notasi ringan)

`src/lib/math.js` — fungsi murni, dipakai klien. **Bukan** LaTeX penuh; hanya kebutuhan
soal sekolah. Mengembalikan **React node / daftar token**, bukan HTML mentah
(jangan `dangerouslySetInnerHTML`).

Sintaks yang didukung, di dalam `text` soal maupun `options`:

| Tulis | Jadi |
|---|---|
| `3/4` | pecahan bertumpuk (pembilang di atas, garis, penyebut di bawah) |
| `2 1/2` | bilangan campuran |
| `sqrt(3)` atau `√3` | akar dengan garis atas |
| `root(3)(8)` | akar pangkat tiga |
| `x^2`, `x^(n+1)` | pangkat atas |
| `_1` | indeks bawah |
| `<=` `>=` `!=` `+-` `*` `xx` | ≤ ≥ ≠ ± × |
| `pi` `theta` `alpha` `beta` `deg` | π θ α β ° |
| `|x|` | nilai mutlak |
| `lim`, `sum`, `int` | ditampilkan tegak (bukan miring) |

Aturan: pecahan/akar **hanya** dirender bila polanya diapit spasi atau berada di awal
sel/akhir sel, supaya `12/03/2026` (tanggal) dan `dan/atau` tidak ikut jadi pecahan.
Teks biasa tetap teks biasa. Selalu sediakan tombol "lihat sebagai teks biasa" di
editor supaya penulis bisa memeriksa apa yang benar-benar tersimpan.

Palet simbol di editor (klik → sisip ke posisi kursor), minimal:
`½ ⅓ ¼ ¾ ⅔ √ ∛ × ÷ ± ≤ ≥ ≠ ≈ ∞ π θ ° ² ³ ⁿ ₁ ₂ ₃ ∑ ∫` dan tombol
"Pecahan", "Akar", "Pangkat".

---

## 8. Anti-inspect di mode ujian

1. Tidak ada state ujian di `localStorage`/`sessionStorage` selain
   `quiz:player:{code}` = `{ playerId, token, name }` (sudah ada).
2. `src/lib/quiz-storage.js` (draft editor) tidak pernah dipakai di jalur ujian.
3. `/play/[code]` tidak menerima `correctIndex` sebelum pemain menjawab
   (ditegakkan `publicState`), dan sesudah menjawab pun server tidak mengirim kunci
   kecuali `instantFeedback`/`showExplanation` menyala.
4. API balasan tidak pernah memuat field internal room (`answers`, `players` Map,
   `hostToken`). Hanya `publicState` dan bentuk balasan yang tertulis di kontrak ini.
5. Halaman ujian memasang `Cache-Control: no-store` (sudah dari middleware) dan
   menonaktifkan menu konteks + navigasi kembali browser **hanya sebagai isyarat UI**
   (bukan pengaman — jelaskan itu di README, jangan berpura-pura aman).

---

## 9. Port

Aplikasi harus jalan di **port 3500** (`http://localhost:3500`), sesuai permintaan
pemilik. Ubah `package.json`:

```json
"scripts": {
  "dev": "next dev -p 3500",
  "start": "next start -p 3500",
  "build": "next build",
  "lint": "eslint ."
}
```

`README.md` diperbarui: semua contoh curl dan URL memakai 3500.

---

## 10. Yang TIDAK berubah

- Pola polling 1 detik + penjaga `version` di `room-client.js`.
- `sessionStorage` untuk identitas host/pemain.
- State room tetap di memori (`globalThis.__liveQuizRooms`); `data/quiz.db` hanya
  untuk akun, template, unggahan, dan arsip sesi.
- Header keamanan di `src/middleware.js`.
- Palet & token desain di `:root` — silakan tambah token baru, jangan ganti yang lama.
