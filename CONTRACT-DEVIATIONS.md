# Penyimpangan dari kontrak — lapisan UI

> Ditulis oleh agent **UI**. Berkas ini mencatat setiap tempat di mana
> implementasi `src/app/**/*.jsx`, `src/components/**`, `src/lib/*` sisi klien
> **tidak persis** mengikuti `CONTRACT.md`, beserta alasannya.
> Bagian server tidak dibahas di sini (agent server punya catatannya sendiri).

Semua penyimpangan di bawah ini **tidak mengubah** kontrak API. Yang berubah
hanya bentuk data internal di sisi klien atau aksi UI yang terpaksa tunduk pada
kontrak yang ada.

---

## 1. `parseMath` mengembalikan token bersarang (bidang berisi daftar token)

**Kontrak §7** hanya menyebut `Array<Token>` dengan `type: "text"|"frac"|…`
tanpa merinci bentuk bidang isinya.

**Yang dipakai:** bidang isi (`num`, `den`, `body`, `base`, `value`, `index`,
`whole`) berisi **daftar token**, bukan string. Alasannya: `sqrt(x^2)` dan
`x^(n+1)` harus tetap dirender sebagai akar/pangkat di dalam isinya, dan itu
mustahil kalau isinya string mentah. Rekursinya pasti berhenti karena isi selalu
lebih pendek dari sumbernya (dibuktikan oleh uji `src/lib/__math-test.mjs`).

`MathText.jsx` menerima **string maupun daftar token** di setiap bidang, jadi
bentuk sederhana (mis. `{ type: "frac", num: "3", den: "4" }`) tetap jalan kalau
ada kode lain yang menghasilkannya.

---

## 2. Pecahan berspasi hanya aktif bila teks memuat TEPAT SATU garis miring

**Kontrak §7** meminta `12/03/2026` dan `dan/atau` tetap teks biasa.

**Yang dipakai:** selain aturan "satu kata utuh" (garis miring harus menempel di
kedua sisi), `3 / 4` (berspasi) juga dikenali sebagai pecahan — tapi **hanya**
bila seluruh teks memuat tepat satu garis miring. Begitu ada dua atau lebih
(`12 / 03 / 2026`, `a / b / c`), semuanya diperlakukan sebagai teks biasa.

Alasan: aturan "kata utuh" saja sudah menutup `12/03/2026`, tapi tidak menutup
versi berspasinya. Aturan hitung-garis-miring sederhana, bisa dijelaskan ke
pengguna, dan tidak pernah menebak-nebak. Kasus yang dikorbankan: soal berisi
dua pecahan berspasi dalam satu kalimat (`2 / 3 + 1 / 6`) — penulisnya cukup
menempelkan garis miringnya (`2/3 + 1/6`), dan itu memang bentuk yang dianjurkan
di editor.

---

## 3. `lim`, `sum`, `int` tidak mendapat perlakuan khusus

**Kontrak §7** menulis "`lim`, `sum`, `int` → ditampilkan tegak (bukan miring)".

**Yang dipakai:** ketiganya lewat sebagai teks biasa tanpa token khusus. Font
aplikasi (`system-ui` untuk UI, Cambria untuk matematika) **tidak miring** —
tidak ada `font-style: italic` di mana pun di `globals.css`. Jadi syaratnya
sudah terpenuhi tanpa kode tambahan, dan tidak ada token baru yang harus
dipahami perender. Menambah token `func` hanya akan menambah permukaan bug
tanpa mengubah satu piksel pun.

---

## 4. `listPublicAccounts()` dan `accountCount()` mengembalikan cache, bukan kebenaran

**Kontrak §3** meminta `src/lib/auth-store.js` tetap mengekspor kedua fungsi itu
"dengan bentuk yang sama". Bentuknya memang sama (sinkron, mengembalikan array /
angka), tapi **sifatnya berubah** dan itu tidak bisa dihindari:

- Daftar akun hidup di server dan endpoint-nya **khusus admin**
  (`GET /api/auth/accounts` → 403 untuk peran lain).
- Versi lama membaca `localStorage`, jadi sinkron dan selalu akurat. Versi baru
  tidak bisa: tidak ada endpoint publik yang boleh membocorkan daftar akun
  (dan memang tidak seharusnya ada).

**Yang dipakai:**

- `fetchAccounts()` (baru, async, khusus admin) → mengisi cache.
- `listPublicAccounts()` → **salinan cache terakhir** (tidak memanggil API).
- `accountCount()` → jumlah di cache terakhir, `0` bila belum pernah dibaca.

Pemakaian nyata:

- `AdminClient.jsx` memanggil `await fetchAccounts()` lalu menampilkan
  `result.accounts` — jadi panel admin selalu akurat.
- `MasukClient.jsx` memakai `accountCount() === 0` untuk memutuskan apakah
  petunjuk akun demo ditampilkan. Konsekuensinya jujur: **untuk pengunjung yang
  belum masuk, angkanya 0 terus**, jadi tawaran akun demo selalu tampil. Itu
  pilihan sadar — akun demo memang di-seed server SEKALI saat tabel `users`
  kosong, dan halaman masuk justru harus menawarkannya saat kustomernya baru
  memasang aplikasi. Begitu seseorang login sebagai admin, angkanya terisi dan
  tawaran itu hilang.

---

## 5. `useRoomState` mengembalikan `refresh` — dan itu dipakai sungguhan

Bukan penyimpangan dari kontrak (kontrak §10 hanya mewajibkan pola polling +
penjaga `version` dipertahankan, dan keduanya tidak disentuh), tapi layak
dicatat karena pemakaiannya bertambah: `refresh()` dipanggil setelah setiap aksi
host (`end`, `lock`, `kick`, `restart`, `advance`) supaya UI tidak menunggu
tick polling berikutnya. `version` tetap penjaga tunggal kapan `setState`
dipanggil.

---

## 6. Mode ujian: jawaban pribadi per soal HANYA di memori, bukan di storage

**Kontrak §6/§8** tidak menyebut `perQuestion[].yourAnswer`, dan `publicState`
memang tidak mengirimnya (server tidak punya alasan mengirim jawaban pribadi
dalam rekap agregat).

**Yang dipakai:** layar akhir mode ujian menampilkan "jawabanmu" dari peta
`index → pilihan` yang dipegang pemain **di dalam memori React** selama ujian
berjalan. Peta itu:

- **tidak pernah** ditulis ke `localStorage`/`sessionStorage` (patuh CONTRACT §8),
- hilang saat halaman ditutup/di-refresh,
- bila kosong (mis. pengguna me-refresh tepat sebelum ujian berakhir), layar
  menulis **"tidak tersedia" apa adanya** dan menampilkan catatan singkat —
  bukan menebak dari `optionCounts` (itu distribusi kelas, bukan jawaban orang).

Alternatifnya adalah meminta server menambahkan field di luar kontrak; itu
melanggar "jangan mengarang endpoint/field", jadi tidak dilakukan.

**Penjelasan per soal di layar akhir ujian.** Tugas UI meminta pembahasan memuat
"soal, jawabanmu, jawaban benar, penjelasan", tapi `results.perQuestion` di
CONTRACT §6 **tidak memuat** `explanation` — dan server memang tidak
mengirimnya. Layar pembahasan karena itu merender baris "Penjelasan:" **hanya
bila** field itu ada, dan tidak menampilkan apa pun bila tidak. Teks soal, kunci
jawaban, dan statistik kelas tetap lengkap dari `perQuestion`. Menampilkan
penjelasan palsu (mis. dari teks soal) akan lebih buruk daripada tidak
menampilkannya.

---

## 7. `allowBack` di mode ujian hanya menampilkan soal sebelumnya

**Kontrak §1** mendefinisikan `allowBack` sebagai "mode ujian: boleh kembali ke
soal sebelumnya". Endpoint room **tidak punya** operasi untuk memindahkan
`player.index` mundur — kontrak §6 hanya menyebut `answer` yang selalu menaikkan
index.

**Yang dipakai:** bila `allowBack` menyala, pemain mendapat tombol **"lihat soal
sebelumnya"** yang membuka daftar soal yang sudah dilewati (dari memori). Soal
bisa dibaca ulang, tapi **jawaban tidak bisa diubah** — UI menyatakannya terus
terang ("jawaban yang sudah terkirim tidak bisa diubah"). Ini penyimpangan
sadar: menaikkan index ke belakang di klien akan membuat klien dan server
berbeda pendapat soal soal mana yang sedang berjalan.

---

## 8. Halaman `/templates/[id]` melayani dua sumber sekaligus

**Kontrak §5** tidak menyebut apa yang terjadi pada 12 template bawaan
(`src/lib/templates-data.js`) setelah template pindah ke API.

**Yang dipakai:** satu halaman, dua sumber, dibedakan dari bentuk id:

- id **slug** (`tpl-perkalian-cepat`) → template bawaan, disanitasi di server
  component (tanpa `correctIndex`), persis seperti perilaku lama.
- id **angka** (`12`) → template server, ringkasan diteruskan SSR lalu
  komponen klien memuat lengkapnya dari `GET /api/templates/[id]`.

Alasan: `templates-data.js` diperintahkan "tetap ada sebagai data contoh untuk
halaman depan", dan menghapus halamannya akan mematikan 12 tautan yang sudah
ada. `TEMPLATE_INDEX` tetap bukan sumber kebenaran daftar — ia hanya muncul di
tab "Jelajahi" sebagai bagian "Koleksi bawaan".

---

## 9. Galat API ditampilkan apa adanya, kecuali daftar akun di halaman masuk

**Kontrak §0.5** mewajibkan pesan galat ramah berbahasa Indonesia. Server sudah
memenuhinya. Satu tempat di UI sengaja **tidak** menampilkan galat server: kalau
`GET /api/templates?mine=1` gagal, halaman Template menampilkan pesan ramahnya
sendiri ("Daftar template tidak bisa dimuat.") dan tetap menampilkan koleksi
bawaan — supaya pengunjung tidak melihat pesan galat 401 saat sekadar menjelajah
tanpa akun.

---

## 10. Empat helper request baru di `room-client.js`

**Kontrak §10** hanya menyebut pola polling dan penyimpanan identitas.
`deleteJson`/`putJson`/`patchJson`/`getJson` ditambahkan karena satu-satunya
cara memanggil API baru (template, auth) tanpa menduplikasi penanganan galat
jaringan. `postJson` sendiri diperluas: sekarang meneruskan `status`, dan
`body === undefined` berarti "tanpa badan" (dipakai DELETE/GET) — perilaku lama
(`body ?? {}`) tidak berubah untuk pemanggil yang mengirim objek.

---
---

# Penyimpangan dari kontrak — lapisan SERVER

> Ditulis oleh agent **server**. Mencatat setiap tempat di mana
> `src/lib/db.js`, `src/lib/auth.js`, `src/lib/pin.js`, `src/lib/uploads.js`,
> `src/lib/scoring.js`, `src/lib/quiz-validate.js`, `src/lib/quiz-store.js`,
> `src/lib/http.js`, dan `src/app/api/**` **tidak persis** mengikuti
> `CONTRACT.md`, beserta alasannya.
>
> Semua penyimpangan di bawah ini menjaga dua hal yang tidak boleh dilanggar:
> `correctIndex` tidak bocor, dan bentuk balasan endpoint yang sudah ada
> (mode `live`) tidak berubah.

---

## S1. `src/lib/pin.js` — modul baru: kriptografi PIN dipisah dari `auth.js`

**Kontrak §3** menaruh hashing di `src/lib/auth.js`. Tidak ada larangan modul
baru, tapi pemisahan ini perlu dijelaskan karena mengubah peta file.

**Masalahnya:** `db.js` wajib bisa men-seed akun demo dengan `hashPin`, dan
`auth.js` wajib bisa membaca tabel `sessions` dari `db.js`. Itu impor dua arah.
Selain itu `auth.js` butuh `cookies()` dari `next/headers`, yang **tidak bisa
diselesaikan Node biasa** — jadi setiap modul yang menyentuh `auth.js` (termasuk
`db.js`) menjadi tidak bisa diuji di luar Next.

**Yang dipakai:** kriptografi PIN (`hashPin`, `verifyPin`) pindah ke
`src/lib/pin.js` — modul murni, hanya `node:crypto`. Arah impor jadi satu arah:
`auth.js → db.js → pin.js`. Tidak ada siklus, tidak ada urutan evaluasi modul
yang perlu dijaga.

`hashPin` dan `verifyPin` **di-ekspor ulang** dari `auth.js`, jadi semua route
tetap mengimpor dari tempat yang sama. Pola hashingnya tidak berubah sedikitt
pun: `scryptSync(pin, salt, 64)`, format `"<saltHex>:<hashHex>"`,
`timingSafeEqual`.

`cookies()` di `auth.js` juga dimuat **lazim** (`await import("next/headers")`)
alih-alih impor statis, dengan alasan yang sama. Semua helper cookie di sana
sudah `async`, jadi bentuk API-nya tidak berubah.

Efek samping yang membuat dua berkas ini sepadan: `scripts/self-test.mjs` yang
diminta tugas ini **tidak mungkin ada** tanpa keduanya — Node murni tidak bisa
mengimpor `next/headers` sama sekali.

---

## S2. `POST /answer` mode `exam` **menghilangkan** `score` dari balasan

**Kontrak §6** menampilkan contoh balasan yang memuat `"score": 3`.

**Yang dipakai:** `score` **tidak** dikirim di balasan mode `exam` selagi
`instantFeedback`/`showExplanation` mati.

**Alasan:** selisih skor antar-jawaban adalah alat tebak benar/salah yang sama
ampuhnya dengan `correct` itu sendiri. Dengan `scoringMode: "exam"` nilainya 1
untuk jawaban benar dan 0 untuk salah — membandingkan `score` sebelum dan
sesudah menjawab memberi tahu kebenarannya tanpa perlu `correctIndex` sama
sekali. Menyembunyikan `correct` tapi mengirim `score` hanya menutup pintu
depan.

**Konsekuensi lanjutan (ditemukan saat tinjauan pemilik proyek, dan lebih
serius dari S2 sendiri):** menghapus `score` dari balasan /answer ternyata
**tidak cukup**, karena angka yang sama masih bocor lewat `progress.score` dan
`you.score` di `publicState` — dan itu ikut di SETIAP polling `GET /state`,
jadi pemain bisa membacanya dari layar "Skor N" tanpa DevTools sama sekali.
Perbaikannya ada di `visibleScoreFor()` di `quiz-store.js`: di mode `exam`
dengan `instantFeedback`/`showExplanation` keduanya mati, skor **dibekukan di 0**
sampai ujian pemain itu selesai (`finishedAt !== null`), lalu ikut lagi begitu
hasil lengkapnya memang sudah terbuka di `results`.

Mode `live` tidak dibekukan — di sana kunci jawaban sudah terbuka di fase
reveal dan papan skor berjalan adalah inti permainannya.

Klien menyesuaikan: `PlayClient` menampilkan **"Terjawab N dari M"** alih-alih
"Skor N" saat ujian dengan umpan balik mati (`scoreHidden`), supaya tidak ada
"Skor 0" yang membingungkan di layar. Skor akhir tetap tampil lengkap di layar
hasil.

---

## S3. `tally` di balasan mode `exam` — DIHAPUS saat reveal mati

**Kontrak §6** meminta `tally: { correct, wrong, unanswered }` di balasan sukses.

**Keputusan akhir (direvisi setelah tinjauan pemilik proyek):** `tally` **dihapus**
dari balasan mode `exam` selama `instantFeedback` dan `showExplanation` keduanya
mati. Ia ikut lagi begitu salah satunya menyala — pada titik itu pemain memang
sudah boleh tahu benar/salah, jadi rekapnya berhenti jadi kebocoran.

**Alasannya:** `tally.correct` naik tepat satu pada jawaban benar dan tidak
bergerak pada jawaban salah. Jadi kombinasi `tally.correct` dan `tally.wrong`
membocorkan kebenaran jawaban terakhir kepada pemain yang membandingkannya
sebelum dan sesudah menjawab — cukup lewat DevTools Network, tanpa perlu
`correctIndex` sama sekali. Aturan §0.2 kontrak ("`correctIndex` tidak pernah
bocor") memang terpenuhi secara harfiah, tapi tujuannya — "pemain tidak bisa
tahu benar/salah selama ujian" — tidak.

Ini kelas kebocoran yang sama dengan `score` di S2, jadi perlakuannya
disamakan: **field yang berubah persis satu langkah hanya ketika jawabannya
benar tidak boleh ada di balasan mode ujian.** Prinsipnya, bukan daftar field.

`tally` **tetap dikirim di mode `live`**, karena di sana kunci jawaban memang
sudah terbuka di fase reveal dan tidak ada yang bisa dibocorkan.

**Konsekuensi:** `scripts/self-test.mjs` kini menguji hal ini secara eksplisit —
daftar kunci balasan mode `exam` yang diizinkan adalah
`["alreadyAnswered", "finished", "nextIndex", "ok", "progress"]`, dan ada
assertion terpisah bahwa `correct`, `points`, `score`, dan `tally` semuanya
absen. Field baru yang bocor akan langsung menggagalkan uji.

`progress` tetap ada dan memang boleh: ia hanya memuat hitungan soal yang sudah
dikerjakan plus skor untuk tampilan pemain ("Skor N"). Di mode `exam` skor tidak
bergerak selama reveal mati (poin baru dihitung di ringkasan akhir), jadi ia
tidak bisa dipakai membedakan benar dari salah.

Yang **dihapus** juga `score` (lihat S2), karena §6 tidak mewajibkannya
secara eksplisit dalam kalimat aturan — hanya ada di contoh JSON.

---

## S4. `publicState().currentIndex` di mode `exam` = indeks **penonton**, bukan indeks room

**Kontrak §6** menulis daftar field lama "tidak berubah nama maupun artinya".

**Yang dipakai:** di mode `exam`, `currentIndex` berisi `player.index` milik
penonton (untuk pemain) atau `0` (untuk host/anonim). Di mode `live` nilainya
persis `room.currentIndex` seperti sebelumnya.

**Alasan:** di mode `exam` tidak ada "soal yang sedang berjalan" untuk seluruh
kelas — `room.currentIndex` hanya penanda, tidak pernah digerakkan siapa pun,
dan akan selalu `0`. Mengirim `0` ke setiap pemain membuat klien menampilkan
"Soal 1" kepada murid yang sedang di soal 17. Angka yang berguna adalah angka
milik penonton itu sendiri.

Konsekuensi yang ikut dicatat: `answeredCount` dan `answeredPlayerIds` **selalu
0/kosong di mode `exam`** (di mode live tidak berubah). Jawaban tiap pemain ada
di soal yang berbeda, jadi "berapa yang sudah menjawab soal ini" tidak punya
arti. Layar host memakai `playerStates` untuk itu.

---

## S5. `question.timeSec` diisi `settings.defaultTimeSec` saat tidak dikirim

**Kontrak §1**: "`per-question` → Setiap soal memakai `question.timeSec` bila
ada, kalau tidak `defaultTimeSec`."

**Yang dipakai:** untuk `timeMode: "per-question"`, `validateRoomInput`
mengisi `timeSec` dengan `settings.defaultTimeSec` (30 default) saat soal tidak
menyebutkannya. Untuk `timeMode` lain (`random`/`total`/`none`), `timeSec`
dibiarkan `null`.

**Alasan:** kalau `timeSec` dibiarkan `null` di mode `per-question`, soal itu
berakhir seketika (durasi 0 detik). Selain itu, pengguna yang menyetel "Durasi
default" di panel pengaturan akan mengira setelannya diabaikan. Dengan cara ini
`defaultTimeSec` benar-benar terpakai, persis seperti bunyi kontrak.

Batas atas durasi per soal juga mengikuti: `MAX_TIME_SEC` (120) dinaikkan
menjadi `max(120, settings.defaultTimeSec)`, supaya pengguna yang menyetel
default 300 detik tidak mendapat error saat menulis soal 200 detik.

---

## S6. Arsip otomatis, dan `rooms_archive` sebagai upsert

**Kontrak §6** hanya menyebut `end`. Tidak menyebutkan apa yang terjadi kalau
kuis berakhir sendiri (soal habis / semua pemain ujian selesai).

**Yang dipakai:** sesi **juga** diarsipkan saat kuis berakhir sendiri — lewat
`advanceLive()` (mode live, soal terakhir lewat) dan `finalizeExamRoom()` (mode
exam, semua pemain selesai). Tanpa ini, satu-satunya cara mendapat arsip adalah
host menekan tombol, dan kuis yang berjalan normal tidak akan pernah tercatat.

`code` adalah PRIMARY KEY `rooms_archive`, jadi arsip memakai
`ON CONFLICT(code) DO UPDATE`. Konsekuensi: room yang di-`restart` lalu
diakhiri lagi akan **menimpa** arsip sebelumnya, bukan menumpuk dua baris
dengan kode yang sama. Satu kode = satu baris arsip dianggap lebih benar
daripada riwayat ganda yang tidak bisa dibedakan.

Kegagalan menulis arsip dibungkus `try/catch` dan **tidak pernah** menggagalkan
pengakhiran sesi: sesi sudah berakhir secara logis, dan memblokirnya hanya
membuat host terjebak di layar yang tidak bisa ditinggalkan.

---

## S7. `POST /api/templates` memakai batas body 256 KB (`MAX_TEMPLATE_BODY_BYTES`)

**Kontrak** tidak menyebut batas body untuk template. `MAX_BODY_BYTES` yang ada
(128 KB) dipakai `POST /api/rooms`.

**Yang dipakai:** konstanta baru `MAX_TEMPLATE_BODY_BYTES = 256 * 1024` di
`http.js`, dipakai `POST`/`PUT` template.

**Alasan:** satu template boleh memuat 100 soal dengan teks 500 karakter, 4 opsi
200 karakter, penjelasan 500 karakter, dan URL gambar — payload sah terbesar
bisa melewati 128 KB, terutama karena karakter Indonesia dalam JSON UTF-8
memakan 2 byte. Batas 128 KB akan menolak template yang sepenuhnya sah. 256 KB
masih jauh dari berbahaya.

---

## S8. `GET /api/uploads/[file]` menolak berkas yang tidak tercatat di DB

**Kontrak §4** mewajibkan validasi nama dengan regex sebelum menyentuh disk.

**Yang dipakai:** regex (`UPLOAD_ID_RE`) **dan** pemeriksaan baris `uploads`.
Berkas yang ada di disk tapi tidak punya baris DB dibalas 404.

**Alasan:** tanpa pemeriksaan kedua, berkas "yatim" (sisa unggahan yang gagal
mencatat barisnya, atau berkas yang disalin manual ke `data/uploads`) tetap
tersaji. Dengan itu, satu-satunya berkas yang bisa dibaca publik adalah berkas
yang benar-benar pernah diunggah lewat API. Biayanya satu query indeks per
gambar; `Cache-Control: immutable` membuatnya hanya terbayar sekali per berkas.

`width`/`height` juga bisa `null` bila header gambarnya tidak terbaca — parser
dimensi sengaja tidak pernah melempar. Kontrak menulis "Balas `201 { url,
width, height }`"; `null` dipilih daripada menolak unggahan yang sah, karena
dimensi hanya dipakai untuk pratinjau.

---

## S9. Admin tidak boleh menghapus akunnya sendiri

**Kontrak §3** hanya menulis "Hapus akun (khusus admin)".

**Yang dipakai:** `DELETE /api/auth/accounts/[id]` membalas `400` bila `id`
yang dihapus adalah akun yang sedang dipakai.

**Alasan:** halaman admin (`GET /api/auth/accounts`) hanya bisa dibaca peran
`admin`. Kalau satu-satunya akun admin bisa menghapus dirinya sendiri, panel
admin menjadi tidak bisa diakses sama sekali dan pemulihannya memerlukan akses
langsung ke berkas SQLite. Satu klik salah tidak boleh berakibat sebesar itu.

---

## S10. `/api/auth/register` dan `/api/auth/login` berbagi satu jatah rate limit

**Kontrak §3**: "Rate limit login/register: 10 percobaan / menit / IP".

**Yang dipakai:** keduanya memakai kunci bucket yang sama (`auth:<ip>`), jadi
10 percobaan per menit untuk keduanya **bersama-sama** — bukan 10 masing-masing.

**Alasan:** kalau dipisah, satu penyerang mendapat 20 percobaan penebakan PIN
per menit dari satu IP hanya dengan mengganti endpoint. Angka 10 di kontrak
dimaksudkan sebagai batas percobaan autentikasi, bukan batas per path.

---

## S11. `MAX_SMALL_BODY_BYTES` 16 KB, dan `/answer` meneruskan hasil store apa adanya

**Kontrak** tidak menyebut ukuran body request kecil.

**Yang dipakai:** `MAX_SMALL_BODY_BYTES` naik 8 KB → 16 KB.

**Alasan:** balasan `/answer` mode ujian kini memuat `progress`, `nextIndex`,
`finished`, dan `tally` di samping field lama; payload masukannya juga memuat
`questionIndex`. 16 KB tetap jauh di bawah batas berbahaya.

Route `/answer` juga **tidak** menyusun ulang daftar field balasan satu per
satu — ia meneruskan objek dari `submitAnswer()` (`json({ ...result })`).
Alasannya: menyusun ulang di lapisan HTTP berarti ada **dua** tempat yang
menentukan apa yang boleh keluar, dan yang kedua itulah yang paling mudah lupa
diperbarui saat mode baru ditambahkan. Dengan satu sumber, uji anti-bocor di
`scripts/self-test.mjs` benar-benar menguji jalur yang dipakai produksi.

---

## S12. `src/lib/templates.js` dibuat lalu dihapus

Catatan proses, bukan penyimpangan kode: sebuah lapisan `templates.js` sempat
dibuat sebagai perantara query template, lalu **dihapus** karena hanya
menduplikasi `db.js` tanpa memberi nilai tambah. Semua akses template memakai
`src/lib/db.js` (`listTemplates`, `getTemplate`, `findTemplateRow`,
`insertTemplate`, `updateTemplate`, `deleteTemplate`, `incrementCloneCount`,
`viewTemplate`, `toTemplate`). Berkas itu tidak ada di repo akhir.

---

# Perubahan overhaul (pasca-kontrak)

> Ditambahkan saat overhaul besar. Semua di bawah ini MEMPERKETAT kontrak atau
> menambah endpoint baru; tidak ada bentuk balasan lama yang berubah.

## O1. Registrasi publik tidak menerima peran `admin`

Kontrak §3 mengizinkan `role: "admin"` di `POST /api/auth/register`. Itu lubang
otorisasi: siapa pun bisa memberi dirinya peran admin. Sekarang:

- `POST /api/auth/register` hanya menerima `guru|siswa` (`validatePublicAccount`).
- Akun admin dibuat lewat **`POST /api/auth/accounts`** (khusus admin), yang
  menerima seluruh peran. UI-nya ada di panel admin ("+ Buat akun").
- `validateRole` yang lama tetap ada (dipakai endpoint admin).

## O2. `publicState` tidak lagi membocorkan data ke penonton anonim

`results`, `roster`, dan `playerStates` kini hanya dikirim ke penonton
beridentitas (host/pemain). Anonim yang tahu kode 6 huruf tetap bisa menonton
kuis berjalan, tapi tidak bisa mengunduh kunci jawaban, daftar nama, atau skor
seluruh peserta setelah sesi selesai.

## O3. `you.rank` disembunyikan selama ujian tanpa reveal

Kontrak tidak menyebut `you.rank`. Karena peringkat dihitung dari skor mentah,
ia berubah persis saat jawaban benar ditambahkan — kelas kebocoran yang sama
dengan `score`/`tally` (S2/S3). Di mode `exam` dengan `instantFeedback` dan
`showExplanation` keduanya mati, `you.rank` kini `null` sampai pemain itu
selesai (`finishedAt !== null`).

## O4. Rate limit `join`/`answer`/`state` + batas pemain

Kontrak hanya menyebut rate limit auth/upload/template/create-room. Ditambah:
`LIMITS.join` (30/menit/IP), `LIMITS.answer` (120/menit per pemain),
`LIMITS.state` (600/menit per pemain/host; anonim lebih ketat), dan
`MAX_PLAYERS_PER_ROOM = 200`.

## O5. `clientIp` / `TRUST_PROXY` opt-in

Kontrak §3 menyebut rate limit "per IP". `TRUST_PROXY` kini **opt-in**
(`TRUST_PROXY=1`); tanpa itu header `X-Forwarded-For` diabaikan dan rate limit
memakai sidik jari header klien (User-Agent + Accept-Language + Sec-CH-UA)
supaya tidak ada bucket global `"unknown"` yang bisa mengunci semua pengguna.

## O6. CSP parsial + HSTS

`src/middleware.js` kini memasang `Content-Security-Policy` parsial
(`object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`)
tanpa mengunci `script-src`/`style-src` (hidrasi Next). HSTS hanya bila
`PUBLIC_BASE_URL` berawalan `https://`.

## O7. Ganti PIN mencabut semua sesi

`POST /api/auth/pin` kini memanggil `destroySessionsForUser` lalu membuat sesi
baru untuk perangkat yang mengganti. Cookie lama (perangkat lain / yang bocor)
langsung tidak berlaku.

## O8. Endpoint baru (di luar kontrak)

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| `POST` | `/api/auth/accounts` | admin | Buat akun (termasuk admin). |
| `GET` | `/api/uploads` | wajib | Daftar gambar milik akun + kuota. |
| `DELETE` | `/api/uploads/[file]` | wajib (pemilik) | Hapus satu gambar. |
| `GET` | `/api/rooms/archive` | wajib | Riwayat sesi (guru: miliknya; admin: semua). |
| `GET` | `/api/rooms/archive/[code]` | wajib | Detail satu arsip. |
| `DELETE` | `/api/rooms/archive/[code]` | wajib | Hapus satu arsip. |

## O9. `reveal.explanation` dan `results.perQuestion[].explanation`

Kontrak §6 tidak memuat `explanation` di `reveal` maupun `results.perQuestion`,
padahal UI membacanya. Field itu kini ikut dikirim — aman karena keduanya hanya
muncul saat kunci jawaban sudah publik (reveal/finished).

## O10. Validasi settings klien memakai modul server

`QuizSettingsPanel.normalizeSettings` kini memanggil `normalizeSettings` dari
`quiz-validate.js` (modul murni, aman di klien). Batas `totalTimeSec` yang dulu
menyimpang (7200 di klien vs 3600 di server) hilang; panel memakai `MAX_SETTINGS_SEC`.

## O11. Tombol host ganda dihapus

"Paksa Lanjut" di kartu "Kontrol host" dihapus; tombol yang sama di panel soal
(`HostLive`) tetap ada. Satu fungsi, satu tombol.

## O12. `OPTION_LETTERS` & `formatClock` diekstrak

Konstanta huruf opsi yang sebelumnya disalin di 7 berkas pindah ke
`src/lib/quiz-ui.js` (bersama `formatClock`).

---

# Refactor putaran 2 (tanpa mengubah kontrak)

> Semua pemindahan di bawah ini MURNI struktur: tidak ada endpoint, bentuk
> balasan, aturan validasi, atau perilaku runtime yang berubah. Impor lama
> (`@/lib/quiz-store`) tetap bekerja karena re-export dipertahankan.

## R1. `quiz-store.js` dipecah (1.751 → 1.118 baris)

| Modul baru | Tanggung jawab |
|---|---|
| `src/lib/quiz-crypto.js` | `randomCode`, `randomToken`, `randomInt`, `shuffled`, `normalizeCode` |
| `src/lib/quiz-timing.js` | `questionTimeSec`, `liveDeadline`, `deadlineForPlayer` |
| `src/lib/quiz-derive.js` | `distributionFor`, `tallyFor`, `buildResults`, `visibleScoreFor`, `visibleRankFor`, `roomReportFor`, dll. |
| `src/lib/public-state.js` | `publicState` — satu-satunya pintu keluar data ke klien |

`quiz-store.js` mengimpor fungsi-fungsi itu dan **re-export `publicState`**,
jadi route `GET /api/rooms/[code]/state` tidak perlu tahu soal pemisahan.

## R2. `globals.css` dipecah (3.825 → 1.205 baris + 2 berkas)

- `src/app/globals.css` — token warna & base.
- `src/app/styles/01-components.css` — komponen dasar (navbar, kartu, tombol,
  modal, editor, dll.).
- `src/app/styles/02-features.css` — matematika, gambar, ujian, host.

Diimpor **berurutan** dari `src/app/layout.jsx`. Turbopack menolak `@import`
CSS yang muncul setelah aturan lain, jadi pemecahan dilakukan lewat impor JS
(urutan impor JS menentukan cascade).

## R3–R5. Komponen klien & uji dipecah

- `PlayClient.jsx` → `PlayDisplay.jsx`, `ExamResults.jsx`, `SeenQuestionsModal.jsx`.
- `EditorClient.jsx` → `EditorModals.jsx` (`PreviewAll`, `BulkAddModal`,
  `SaveTemplateModal`).
- `self-test.mjs` → `test-harness.mjs`, `test-fixtures.mjs`, dan
  `scripts/tests/01..06-*.mjs`; `self-test.mjs` kini hanya runner.

## R6. Aturan React hooks diaktifkan kembali

`eslint.config.mjs` tidak lagi mematikan `react-hooks/refs` dan
`react-hooks/set-state-in-effect` secara global. Perbaikan kode yang menyertainya:

- `room-client.js` — penulisan `handlersRef`/`authRef` dipindah dari saat render
  ke `useEffect`.
- `PlayClient.jsx` — `seenRef`/`myAnswersRef` yang dibaca saat render diubah
  menjadi state (`seen`, `myAnswers`).
- `MathPalette.jsx` — tidak lagi membaca `ref.current` saat render; status
  aktif ditentukan dari `targetKey` (state).

Sisa pemakaian `setState` di dalam effect yang memang menyinkronkan state lokal
dengan sistem eksternal (sessionStorage, localStorage, respons API) diberi
`eslint-disable-next-line` **per baris** beserta alasannya — bukan dimatikan
untuk seluruh proyek.

---

# Perubahan putaran 3 (fitur & konsistensi)

## T1. Filter & metadata template diperluas

Kontrak §5 mendefinisikan `subject`, `gradeLevel`, `tags`, `coverImage`, tapi
tidak ada filter/cari berdasarkan field itu. Sekarang `GET /api/templates`
menerima `subject`, `gradeLevel`, `tag`, dan `facets=1` (daftar nilai unik yang
benar-benar ada). `listTemplates()` di `db.js` menyaring field tersebut di SQL.

## T2. `all=1` untuk moderasi admin

`GET /api/templates?all=1` mengembalikan SEMUA template (termasuk privat) dan
hanya diizinkan untuk peran admin (selain itu 403). Panel admin memakainya untuk
moderasi + hapus.

## T3. Metadata template bisa diisi dari editor

`SaveTemplateModal` kini punya input mata pelajaran (dengan saran), tag
(chip editor), dan gambar sampul (`ImagePicker`). Field ini diteruskan ke draft
lokal (`createQuiz`/autosave) dan ke API template.

## T4. Komponen state bersama

`src/components/AsyncState.jsx` menyediakan `LoadingState` dan `ErrorState`
(dengan tombol "Coba lagi"), menggantikan pola `waiting`/`alert-error` yang
sebelumnya ditulis ulang di banyak halaman.

## T5. Halaman Dashboard per peran

`/dashboard` menampilkan konten berbeda menurut peran: guru/admin melihat
ringkasan kuis, template, dan sesi terakhir; siswa melihat gabung-kode +
riwayat; tamu melihat ajakan masuk. Semua angka dari data nyata (localStorage +
API).

## T6. Landing page dilengkapi

Halaman depan menambah bagian "Kenapa Yue Quiz?", FAQ, CTA band, dan footer;
carousel template diganti grid agar konsisten dengan halaman Template.

---

# Perubahan putaran 4 (production readiness & UX)

## U1. CSP: `script-src`/`style-src` mengizinkan `'unsafe-inline'`

CSP parsial di putaran 1 memakai `default-src 'self'` tanpa mengecualikan
`script-src`/`style-src`. Next.js menyuntikkan bootstrap hidrasi sebagai script
INLINE, jadi `default-src 'self'` **memblokir hidrasi** di produksi. Directive
`script-src 'self' 'unsafe-inline'` dan `style-src 'self' 'unsafe-inline'`
ditambahkan. Ini kompromi sadar (nonce per-request belum dipasang); directive
lain tetap menutup object/embed, base-tag, framing, dan form-action.

## U2. Klien menghormati `alreadyAnswered`

`POST /answer` idempoten di server, tetapi klien dulu menimpa pilihan lokal
dengan klik baru walau server membalas `alreadyAnswered: true`. Akibatnya layar
bisa menampilkan opsi berbeda dari yang dicatat server. Sekarang: saat
`alreadyAnswered`, klien tidak menimpa `chosenIndex`/`myAnswers`, dan
`lockedIndex` memprioritaskan jawaban server (`you.answerIndex`).

## U3. Privasi anonim: `leaderboard` & `players`

`leaderboard` (nama + skor semua pemain) dan `players` (nama saat lobby) dulu
tetap dikirim ke penonton anonim. Kini keduanya digerbangi `viewer` — anonim
hanya bisa menonton kuis berjalan, bukan mengunduh daftar nama/skor kelas.

## U4. TTL room berbasis aktivitas

`pruneRooms()` dulu menghitung umur dari `createdAt`, sehingga ujian panjang
(atau room yang dibuat pagi lalu dipakai siang) bisa terhapus di tengah sesi.
Kini memakai `lastActivityAt` yang diperbarui di setiap `getRoom()`.

## U5. Grace period batas waktu

Jawaban yang tiba tepat setelah deadline karena latensi jaringan kini diterima
dalam jendela `ANSWER_GRACE_MS` (1200 ms). Deadline tetap ditentukan server;
grace hanya toleransi latensi. Perpindahan fase `question → reveal` dan
expiry pemain exam juga menunggu grace agar konsisten.

## U6. Timeout request tulis

`requestJson()` di `room-client.js` memakai `AbortController` dengan batas 15
detik. Tanpa ini, koneksi yang menggantung membuat tombol jawaban ter-disable
selamanya.

## U7. Rate limit ganti PIN

`POST /api/auth/pin` kini memakai `consume()` (bucket yang sama dengan login)
sebelum memverifikasi PIN lama — mencegah penyikatan PIN lewat sesi yang dicuri.

## U8. Filter tag meng-escape wildcard LIKE

Filter tag sebelumnya hanya membuang `"`/`\`; `%` dan `_` tetap jadi wildcard.
Kini di-escape dengan `\` + `ESCAPE '\'`, sehingga tag `%` tidak mencocokkan
semua.

## U9. Endpoint & skrip baru

| Method | Path | Keterangan |
|---|---|---|
| `GET` | `/api/health` | Kesiapan: `{ ok, uptimeSec, rooms }` (tanpa data sensitif). |
| — | `npm run backup` | Snapshot konsisten `data/quiz.db` via API backup `node:sqlite`. |

## U10. Aksesibilitas & UI

- `Modal` kini punya focus trap, fokus awal, dan pemulihan fokus ke pemicu.
- `.choice-card.is-selected` ditambahkan (sebelumnya kelas tanpa aturan CSS).
- Drawer mobile memuat tautan "Masuk / Daftar" untuk tamu.
- OTP kode room memakai `width: min(...)` agar tidak overflow di layar 360px.
- `:focus-visible` global tidak lagi mengubah `border-radius` elemen.
- Input di baris opsi & chip waktu mendapat indikator fokus pengganti.
- Target sentuh naik ≥44px pada perangkat pointer kasar.
- "Panel Admin" hanya tampil untuk peran admin (sebelumnya juga guru).
- Ekspor CSV per sesi ditambahkan di halaman riwayat.





