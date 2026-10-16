// ═══════════════════════════════════════════════════════════════════════════
// QUIZ STORE — seluruh state kuis hidup di memori proses ini
// ═══════════════════════════════════════════════════════════════════════════
// Tidak ada database, tidak ada Redis, tidak ada socket. Semua room disimpan
// di satu Map. Konsekuensinya jujur: state HILANG saat server restart, dan
// aplikasi TIDAK bisa dijalankan multi-instance (dua proses Node tidak saling
// melihat room satu sama lain). Lihat README bagian "Batasan yang diketahui".
//
// SQLite (data/quiz.db) HANYA dipakai untuk hal yang harus bertahan: akun,
// sesi, template, unggahan, dan ARSIP sesi yang sudah berakhir. Room berjalan
// tidak pernah menyentuh disk — polling 1 detik tidak boleh menunggu I/O.
//
// Semua operasi di bawah bersifat ATOMIK secara logis. JavaScript berjalan
// single-threaded, jadi tidak perlu lock — TAPI setiap operasi baca-ubah-tulis
// harus selesai tanpa `await` di tengahnya. Kalau ada `await` di tengah,
// request lain bisa menyelinap dan membaca state setengah jadi.
// ═══════════════════════════════════════════════════════════════════════════

import { scoreForMode } from "./scoring.js"
import { safeEqual } from "./secure-compare.js"
import { archiveRoom } from "./db.js"
import { publicState } from "./public-state.js"
import { randomCode, randomInt, randomToken, shuffled, normalizeCode } from "./quiz-crypto.js"
import { deadlineForPlayer, liveDeadline, questionTimeSec } from "./quiz-timing.js"
import {
  answeredByPlayer,
  answeredCountFor,
  answeredIdsFor,
  buildResults,
  distributionFor,
  progressFor,
  roomReportFor,
  tallyFor,
} from "./quiz-derive.js"

// publicState tinggal di modul terpisah (public-state.js) — satu-satunya pintu
// keluar data ke klien. Di-re-export di sini supaya route lama tidak perlu tahu
// soal pemisahan itu.
export { publicState }

// Konstanta & validasi tinggal di modul murni (quiz-validate.js) agar DIPAKAI
// BERSAMA oleh server (di sini) dan klien (editor/import).
//
// PENTING: nilai-nilainya di-IMPORT ke scope lokal (bukan cuma di-re-export),
// karena fungsi di file ini (joinRoom, submitAnswer, …) memakainya langsung.
// `export { X } from "..."` saja TIDAK membuat X tersedia sebagai binding lokal
// — akibatnya referensinya melempar ReferenceError saat runtime.
import {
  DEFAULT_SETTINGS,
  MAX_NAME_LEN,
  OPTION_COUNT,
  normalizeSettings,
} from "./quiz-validate.js"

export {
  DEFAULT_TIME_SEC,
  MIN_TIME_SEC,
  MAX_TIME_SEC,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  MAX_TITLE_LEN,
  MAX_QUESTION_TEXT_LEN,
  MAX_OPTION_LEN,
  MAX_EXPLANATION_LEN,
  MAX_IMAGE_URL_LEN,
  MAX_NAME_LEN,
  OPTION_COUNT,
  TIME_MODES,
  QUIZ_MODES,
  SCORING_MODES,
  DEFAULT_SETTINGS,
  normalizeSettings,
  normalizeImageUrl,
  normalizeTags,
  validateRoomInput,
  validateTemplateInput,
  validateDraft,
} from "./quiz-validate.js"

// Room disimpan di Map yang ditempelkan ke globalThis supaya TIDAK reset
// saat Next.js hot-reload di mode dev (modul di-reload, globalThis bertahan).
const globalForQuiz = globalThis
if (!globalForQuiz.__liveQuizRooms) {
  globalForQuiz.__liveQuizRooms = new Map()
}
const rooms = globalForQuiz.__liveQuizRooms

// ─── Konstanta kebijakan ───────────────────────────────────────────────────
/** Umur maksimum room. Lebih tua dari ini dibuang oleh pruneRooms(). */
export const ROOM_TTL_MS = 3 * 60 * 60 * 1000 // 3 jam
// Konstanta soal (durasi, jumlah, panjang teks) tinggal di quiz-validate.js
// dan di-re-export di atas.

/** Jumlah detik yang ditambahkan host lewat kontrol "+10 Detik". */
export const EXTEND_AMOUNT_SEC = 10
/** Batas perpanjangan per soal — mencegah spam +10s membuat soal tak berujung. */
export const MAX_EXTEND_PER_QUESTION = 6
/**
 * Toleransi latensi jaringan saat menerima jawaban di detik terakhir.
 *
 * Deadline tetap ditentukan server (tidak bisa dicurangi klien). Grace ini
 * hanya memberi ruang agar jawaban yang secara persepsi pemain dikirim tepat
 * sebelum timer habis — tetapi tiba di server beberapa ratus milidetik
 * kemudian — tidak hilang. Diterapkan di kedua mode dan juga menunda
 * perpindahan fase `question → reveal` selama grace, supaya konsisten.
 */
export const ANSWER_GRACE_MS = 1200
/**
 * Batas pemain per room. Tanpa batas, satu room bisa diisi ribuan nama palsu
 * (masing-masing satu entri Map + token) dan menghabiskan memori server.
 * 200 jauh di atas kebutuhan satu kelas (30–40) tapi tetap membendung skrip.
 */
export const MAX_PLAYERS_PER_ROOM = 200

// ═══════════════════════════════════════════════════════════════════════════
// OPERASI ROOM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Buat room baru. Kode diulang sampai tidak bentrok dengan room yang ada.
 *
 * Urutan kerja yang penting:
 *   1. normalisasi settings (semua field opsional → lengkap),
 *   2. SALIN soal (jangan pernah memutasi objek input — pemanggil bisa jadi
 *      menyimpan payload yang sama untuk hal lain),
 *   3. acak urutan soal & opsi BILA diminta, sekaligus perbaiki correctIndex,
 *   4. undi durasi tiap soal SEKALI bila timeMode "random", lalu kunci.
 *
 * @param {{ title: string, questions: Array, settings?: object, hostUser?: number }} input
 * @returns {{ room: object }}
 */
export function createRoom({ title, questions, settings, hostUser = null }) {
  const normalized = normalizeSettings(settings)
  // validateRoomInput() sudah memvalidasi settings; createRoom bisa juga
  // dipanggil langsung (mis. dari pengujian), jadi kegagalan di sini tetap
  // harus terlihat — bukan diam-diam memakai default.
  if (!normalized.ok) {
    throw new Error(normalized.error)
  }
  const resolvedSettings = normalized.value

  let code = randomCode()
  let guard = 0
  while (rooms.has(code) && guard < 50) {
    code = randomCode()
    guard += 1
  }
  // Kalau 50 percobaan masih bentrok (praktis mustahil), pakai kode panjang
  // supaya tidak pernah menimpa room yang sudah ada.
  if (rooms.has(code)) code = randomCode(10)

  const now = Date.now()

  // ── 2) salinan soal + normalisasi bentuk ────────────────────────────────
  let prepared = (Array.isArray(questions) ? questions : []).map((question) => ({
    text: question.text,
    options: Array.isArray(question.options) ? [...question.options] : [],
    correctIndex: question.correctIndex,
    timeSec:
      resolvedSettings.timeMode === "per-question"
        ? Number.isInteger(question.timeSec)
          ? question.timeSec
          : resolvedSettings.defaultTimeSec
        : Number.isInteger(question.timeSec)
          ? question.timeSec
          : null,
    image: question.image ?? null,
    optionImages:
      Array.isArray(question.optionImages) && question.optionImages.length === OPTION_COUNT
        ? [...question.optionImages]
        : [null, null, null, null],
    explanation: question.explanation ?? null,
  }))

  // ── 3) pengacakan ───────────────────────────────────────────────────────
  if (resolvedSettings.shuffleOptions) {
    prepared = prepared.map((question) => {
      const order = shuffled(question.options.map((_, index) => index))
      const options = order.map((from) => question.options[from])
      const optionImages = order.map((from) => question.optionImages[from] ?? null)
      return {
        ...question,
        options,
        optionImages,
        correctIndex: order.indexOf(question.correctIndex),
      }
    })
  }

  if (resolvedSettings.shuffleQuestions) {
    prepared = shuffled(prepared)
  }

  // ── 4) undian durasi mode "random" — SEKALI, lalu dikunci ───────────────
  let rolledTimes = null
  if (resolvedSettings.timeMode === "random") {
    const span = resolvedSettings.randomMaxSec - resolvedSettings.randomMinSec + 1
    rolledTimes = prepared.map(() => resolvedSettings.randomMinSec + randomInt(span))
    prepared = prepared.map((question, index) => ({ ...question, timeSec: rolledTimes[index] }))
  }

  const room = {
    code,
    title,
    hostToken: randomToken(),
    // Pemilik terautentikasi (bila host membuat room sambil login) — dipakai
    // arsip di rooms_archive.host_user.
    hostUser: hostUser ?? null,
    createdAt: now,
    // Aktivitas terakhir (request apa pun). TTL room dihitung dari sini, bukan
    // dari createdAt — supaya ujian panjang atau room yang dibuat pagi lalu
    // dipakai siang tidak terhapus di tengah sesi.
    lastActivityAt: now,
    // Kapan kuis benar-benar dimulai (dipakai arsip + hitungan detik terpakai).
    startedAt: null,
    endedAt: null,
    archiveCode: null,
    phase: "lobby",
    version: 0,
    currentIndex: -1,
    // Kapan soal aktif mulai — dipakai untuk menghitung msTaken.
    questionStartedAt: null,
    // Batas waktu soal aktif (timestamp ms) — DITENTUKAN SERVER, bukan klien.
    questionDeadline: null,
    // Salinan settings lengkap (mode, timeMode, scoringMode, …). Semua nilai
    // di sini sudah tervalidasi & sudah diisi default.
    settings: resolvedSettings,
    mode: resolvedSettings.mode,
    // Lobby terkunci: join ditolak sampai host membuka lagi.
    locked: false,
    // Hasil undian durasi mode "random" — host boleh melihatnya.
    rolledTimes,
    questions: prepared,
    players: new Map(),
    // kunci: `${questionIndex}:${playerId}`
    answers: new Map(),
    // Berapa kali host memperpanjang soal aktif (kontrol "+10 Detik").
    // Direset setiap soal berganti (startQuiz / nextQuestion).
    extendsUsed: 0,
    // Soal mana yang sudah pernah di-skip host (Set index) — dipakai report.
    skippedIndexes: new Set(),
  }

  rooms.set(code, room)
  return { room }
}

/**
 * Ambil room berdasarkan kode. Case-insensitive.
 *
 * Sekaligus menandai `lastActivityAt` — setiap request yang menyentuh room
 * (polling state, join, jawab, aksi host) dianggap aktivitas, sehingga TTL
 * dihitung dari pemakaian terakhir, bukan kapan room dibuat.
 * @returns {object|null}
 */
export function getRoom(code) {
  const room = rooms.get(normalizeCode(code)) || null
  if (room) room.lastActivityAt = Date.now()
  return room
}

/**
 * Bergabung ke room sebagai pemain.
 *
 * Dua kebijakan berbeda disengaja:
 *   • mode `live` — kelas berjalan bersama, jadi terlambat berarti ketinggalan:
 *     join hanya di lobby.
 *   • mode `exam` — setiap orang punya jamnya sendiri, jadi pemain yang datang
 *     terlambat TETAP boleh masuk dan mulai dari soal pertama. Kalau ditolak,
 *     satu murid yang telat 10 detik kehilangan seluruh ujiannya.
 *
 * @returns {{ player: object } | { error: string, code: number }}
 */
export function joinRoom(code, name) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }

  if (room.locked) {
    return { error: "Room sedang dikunci host.", code: 409 }
  }

  if (typeof name !== "string") {
    return { error: 'Field "name" wajib diisi dan harus berupa teks.', code: 400 }
  }
  const cleanName = name.trim()
  if (cleanName.length === 0) return { error: "Nama tidak boleh kosong.", code: 400 }
  if (cleanName.length > MAX_NAME_LEN) {
    return { error: `Nama maksimal ${MAX_NAME_LEN} karakter.`, code: 400 }
  }

  if (room.phase === "finished") {
    return { error: "Kuis sudah selesai.", code: 409 }
  }
  if (room.mode !== "exam" && room.phase !== "lobby") {
    return { error: "Kuis sudah dimulai.", code: 409 }
  }

  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    return {
      error: `Room ini sudah penuh (maksimal ${MAX_PLAYERS_PER_ROOM} pemain).`,
      code: 409,
    }
  }

  const lowered = cleanName.toLowerCase()
  for (const player of room.players.values()) {
    if (player.name.toLowerCase() === lowered) {
      return { error: "Nama itu sudah dipakai di room ini.", code: 409 }
    }
  }

  const now = Date.now()
  const late = room.phase !== "lobby"

  const player = {
    id: randomToken(),
    name: cleanName,
    token: randomToken(),
    score: 0,
    joinedAt: now,
    connectedAt: now,
    // ── Progres per pemain (mode exam) ──
    index: 0,
    deadline: null,
    startedAt: late ? now : null,
    finishedAt: null,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    // Kapan pemain terakhir mengirim jawaban — dipakai untuk "detik terpakai".
    lastAnswerAt: null,
  }

  // Pemain yang bergabung SETELAH kuis (mode exam) langsung mendapat jamnya
  // sendiri: mulai dari soal pertama, batas waktu dihitung dari sekarang.
  if (late) {
    player.deadline = deadlineForPlayer(room, player, now)
  }

  room.players.set(player.id, player)
  room.version += 1

  return { player }
}

/**
 * Cek apakah token yang dikirim adalah token host room ini.
 * Perbandingan waktu-konstan lewat safeEqual (lihat secure-compare.js).
 */
export function isHost(room, hostToken) {
  if (!room || typeof hostToken !== "string") return false
  return hostToken.length > 0 && safeEqual(hostToken, room.hostToken)
}

/**
 * Autentikasi pemain dari playerId + token.
 * @returns {object|null} player atau null bila tidak cocok
 */
export function authenticatePlayer(room, playerId, token) {
  if (!room || typeof playerId !== "string" || typeof token !== "string") return null
  const player = room.players.get(playerId)
  if (!player) return null
  if (!safeEqual(token, player.token)) return null
  return player
}

// ═══════════════════════════════════════════════════════════════════════════
// WAKTU — keputusan deadline tinggal di quiz-timing.js (fungsi murni).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mulai kuis. Perilaku berbeda per mode:
 *   live → satu `currentIndex` bersama (perilaku lama, tidak diubah)
 *   exam → SETIAP pemain dapat `index`, `startedAt`, `deadline` sendiri
 *
 * @returns {{ ok: true, version: number } | { error: string, code: number }}
 */
export function startQuiz(code, hostToken) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }
  if (room.phase !== "lobby") return { error: "Kuis sudah dimulai.", code: 409 }
  if (room.questions.length === 0) {
    return { error: "Kuis ini tidak punya soal.", code: 409 }
  }

  const now = Date.now()
  room.phase = "question"
  room.currentIndex = 0
  room.questionStartedAt = now
  room.questionDeadline = liveDeadline(room, now, 0)
  room.startedAt = now
  room.endedAt = null
  room.extendsUsed = 0
  room.skippedIndexes = new Set()

  if (room.mode === "exam") {
    for (const player of room.players.values()) {
      player.index = 0
      // Pemain yang bergabung terlambat sudah punya startedAt — jangan di-reset,
      // jamnya sudah berjalan sejak ia masuk.
      if (player.startedAt === null) player.startedAt = now
      player.finishedAt = null
      player.correctCount = 0
      player.wrongCount = 0
      player.unansweredCount = 0
      player.lastAnswerAt = null
      player.deadline = deadlineForPlayer(room, player, now)
    }
  }

  room.version += 1

  return { ok: true, version: room.version }
}

/**
 * Kirim jawaban pemain.
 *
 * IDEMPOTENT: kalau pemain sudah menjawab soal ini, jawaban yang SUDAH ADA
 * dikembalikan apa adanya — tidak ditimpa, tidak error. Ini penting karena
 * jaringan bisa retry (koneksi putus setelah server memproses tapi sebelum
 * respons sampai ke klien).
 *
 * Mode `exam` memakai `player.index` sebagai soal yang berjalan, BUKAN
 * `room.currentIndex`: tiap pemain punya posisinya sendiri. `questionIndex`
 * dari klien tetap dipakai sebagai KUNCI idempotensi supaya retry atas soal
 * yang sudah ditinggalkan tidak tercatat sebagai jawaban soal berikutnya.
 *
 * @returns {{ ok: true, ... } | { error: string, code: number }}
 */
export function submitAnswer(code, { playerId, token, questionIndex, optionIndex }) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }

  const player = authenticatePlayer(room, playerId, token)
  if (!player) return { error: "Token pemain tidak valid.", code: 403 }

  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= OPTION_COUNT) {
    return { error: `Pilihan jawaban harus antara 1–${OPTION_COUNT}.`, code: 400 }
  }

  if (room.phase === "finished") {
    return { error: "Kuis sudah selesai.", code: 409 }
  }
  if (room.phase !== "question") {
    return { error: "Soal sudah berakhir.", code: 409 }
  }

  const now = Date.now()

  if (room.mode === "exam") {
    return submitExamAnswer(room, player, questionIndex, optionIndex, now)
  }
  return submitLiveAnswer(room, player, questionIndex, optionIndex, now)
}

/** Mode `live` — perilaku lama, poin mengikuti scoringMode, plus umpan balik. */
function submitLiveAnswer(room, player, questionIndex, optionIndex, now) {
  if (questionIndex !== room.currentIndex) {
    return { error: "Soal ini bukan soal yang sedang berjalan.", code: 409 }
  }

  const settings = room.settings
  const question = room.questions[questionIndex]
  const key = `${questionIndex}:${player.id}`
  const existing = room.answers.get(key)

  if (existing) {
    return liveAnswerReply(room, player, questionIndex, existing, true)
  }

  if (room.questionDeadline !== null && now >= room.questionDeadline + ANSWER_GRACE_MS) {
    return { error: "Waktu habis.", code: 409 }
  }

  const totalMs = questionTimeSec(room, questionIndex) * 1000
  // Sisa waktu untuk bonus kecepatan tidak pernah negatif, jadi jawaban dalam
  // masa grace mendapat bonus 0 (bukan bonus negatif).
  const remainingMs =
    room.questionDeadline === null ? 0 : Math.max(0, room.questionDeadline - now)
  const correct = optionIndex === question.correctIndex
  const points = scoreForMode({
    correct,
    remainingMs,
    totalMs,
    scoringMode: settings.scoringMode,
  })

  const answer = {
    optionIndex,
    at: now,
    msTaken: now - (room.questionStartedAt ?? now),
    correct,
    points,
  }

  // Baca-ubah-tulis tanpa `await` di tengah — aman di runtime single-threaded.
  room.answers.set(key, answer)
  player.score += points
  player.lastAnswerAt = now
  if (correct) player.correctCount += 1
  else player.wrongCount += 1
  room.version += 1

  return liveAnswerReply(room, player, questionIndex, answer, false)
}

/** Bentuk balasan POST /answer mode live. */
function liveAnswerReply(room, player, questionIndex, answer, already) {
  const settings = room.settings
  const question = room.questions[questionIndex]
  return {
    ok: true,
    alreadyAnswered: already,
    correct: answer.correct,
    points: answer.points,
    score: player.score,
    // Sengaja dikirim: ini respons PRIVAT ke pemain yang jawabannya sudah
    // terkunci (idempotent), jadi dia tidak bisa memanfaatkannya lagi.
    // Lihat README bagian Anti-cheat untuk diskusi lengkapnya.
    correctIndex: question.correctIndex,
    explanation: settings.showExplanation ? question.explanation ?? null : null,
    progress: progressFor(room, player),
    nextIndex: null,
    finished: false,
    tally: tallyFor(room, player),
    distribution: distributionFor(room, questionIndex),
    answeredCount: answeredCountFor(room, questionIndex),
  }
}

/** Mode `exam` — self-paced: indeks & deadline milik pemain sendiri. */
function submitExamAnswer(room, player, questionIndex, optionIndex, now) {
  const settings = room.settings

  // ── Kunci idempotensi: soal yang DIMAKSUD klien ─────────────────────────
  // Kalau klien mengirim indeks, itulah soalnya. Bila tidak dikirim, ambil
  // posisi pemain saat ini (server yang menentukan).
  const targetIndex = Number.isInteger(questionIndex) ? questionIndex : player.index

  const existing = room.answers.get(`${targetIndex}:${player.id}`)
  if (existing) {
    return examAnswerReply(room, player, existing, true)
  }

  if (player.finishedAt !== null) {
    return { error: "Ujianmu sudah selesai.", code: 409 }
  }

  // Waktu soal ini sudah lewat (melewati grace latensi) → catat sebagai tidak
  // menjawab lebih dulu, lalu tolak jawaban yang datang telat. Polling
  // berikutnya sudah membawa indeks yang baru, jadi klien tidak perlu tahu.
  if (player.deadline !== null && now >= player.deadline + ANSWER_GRACE_MS) {
    const before = player.index
    expirePlayer(room, player, now)
    if (player.index !== before) finalizeExamRoom(room, now)
    return { error: "Waktu habis.", code: 409 }
  }

  if (targetIndex !== player.index) {
    return { error: "Soal ini bukan soal yang sedang berjalan.", code: 409 }
  }
  if (targetIndex < 0 || targetIndex >= room.questions.length) {
    return { error: "Soal tidak ditemukan.", code: 409 }
  }

  const question = room.questions[targetIndex]
  const totalMs = questionTimeSec(room, targetIndex) * 1000
  const remainingMs = player.deadline === null ? 0 : Math.max(0, player.deadline - now)
  const correct = optionIndex === question.correctIndex
  const points = scoreForMode({
    correct,
    remainingMs,
    totalMs,
    scoringMode: settings.scoringMode,
  })

  const answer = {
    optionIndex,
    at: now,
    msTaken: now - (player.startedAt ?? now),
    correct,
    points,
    questionIndex: targetIndex,
  }

  room.answers.set(`${targetIndex}:${player.id}`, answer)
  player.score += points
  player.lastAnswerAt = now
  if (correct) player.correctCount += 1
  else player.wrongCount += 1

  // ── Maju ke soal berikutnya (self-paced: tidak menunggu siapa pun) ──────
  player.index += 1
  if (player.index >= room.questions.length) {
    player.index = room.questions.length
    player.finishedAt = now
    player.deadline = null
  } else {
    player.deadline = deadlineForPlayer(room, player, now)
  }

  room.version += 1
  finalizeExamRoom(room, now)

  return examAnswerReply(room, player, answer, false)
}

/**
 * Bentuk balasan POST /answer mode exam.
 *
 * ATURAN KEBOCORAN — INI BAGIAN PALING PENTING DI SELURUH MODE UJIAN:
 * `correct`, `correctIndex`, `explanation`, dan `points` hanya ikut dikirim
 * bila `instantFeedback` atau `showExplanation` menyala. Dengan keduanya mati
 * (default), balasan HANYA berisi ok / alreadyAnswered / progress / nextIndex /
 * finished — tidak ada satu field pun yang membedakan jawaban benar dari salah.
 *
 * DUA FIELD SENGAJA TIDAK IKUT, dan alasannya sama untuk keduanya — keduanya
 * berubah persis satu langkah hanya ketika jawabannya BENAR, jadi selisihnya
 * adalah alat tebak yang sama ampuhnya dengan mengirim `correct` langsung:
 *
 *   • `score`    — selisih skor antar-jawaban. Klien membacanya dari
 *                  `progress.score` / `state.progress`, bukan dari balasan ini.
 *   • `tally`    — `tally.correct` naik tepat satu pada jawaban benar dan tidak
 *                  bergerak pada jawaban salah. Ini yang paling halus: satu
 *                  field yang tampak tidak berbahaya, tapi cukup untuk
 *                  menentukan benar/salah lewat DevTools Network.
 *
 * `tally` tetap dikirim di mode `live` (lihat `liveAnswerReply`) — di sana
 * kunci jawaban memang sudah terbuka di fase reveal, jadi tidak ada yang bocor.
 * Di mode exam ia ikut lagi hanya saat `reveal` menyala, karena pada titik itu
 * pemain memang sudah boleh tahu.
 *
 * Lihat CONTRACT-DEVIATIONS.md bagian Server untuk alasan `score` dihilangkan
 * (contoh balasan di CONTRACT §6 masih mencantumkannya).
 */
function examAnswerReply(room, player, answer, already) {
  const settings = room.settings
  const reveal = settings.instantFeedback || settings.showExplanation
  const question = Number.isInteger(answer.questionIndex)
    ? room.questions[answer.questionIndex]
    : null

  const reply = {
    ok: true,
    alreadyAnswered: already,
    progress: progressFor(room, player),
    nextIndex: player.index >= room.questions.length ? null : player.index,
    finished: player.finishedAt !== null,
  }

  if (reveal) {
    reply.correct = answer.correct
    reply.points = answer.points
    reply.score = player.score
    reply.correctIndex = question ? question.correctIndex : null
    reply.explanation = question ? question.explanation ?? null : null
    // Ikut HANYA di sini: begitu pemain boleh tahu benar/salah, rekapnya
    // berhenti jadi kebocoran.
    reply.tally = tallyFor(room, player)
  }

  return reply
}

/**
 * Pemain kehabisan waktu: catat soal yang belum dikerjakan sebagai "tidak
 * menjawab" dan maju — berulang bila jamnya sudah lewat untuk beberapa soal
 * sekaligus (mode `total`, di mana SATU deadline menutup seluruh ujian).
 */
function expirePlayer(room, player, now) {
  let guard = 0
  const maxSteps = room.questions.length + 1

  while (
    player.finishedAt === null &&
    player.index < room.questions.length &&
    guard < maxSteps
  ) {
    if (player.deadline === null || now < player.deadline) break

    const key = `${player.index}:${player.id}`
    if (!room.answers.has(key)) player.unansweredCount += 1

    player.index += 1
    if (player.index >= room.questions.length) {
      player.index = room.questions.length
      player.finishedAt = now
      player.deadline = null
    } else {
      player.deadline = deadlineForPlayer(room, player, now)
    }
    guard += 1
  }

  return guard > 0
}

/**
 * Tutup ujian bila SEMUA pemain sudah selesai.
 *
 * Room kosong sengaja TIDAK ditutup: pemain yang bergabung terlambat masih
 * harus bisa masuk (mode exam). Tanpa aturan ini, exam dengan nol pemain akan
 * langsung "finished" dan satu-satunya orang yang mau ikut ujian tidak punya
 * pintu masuk.
 */
function finalizeExamRoom(room, now) {
  if (room.mode !== "exam") return false
  if (room.phase === "finished") return false
  if (room.players.size === 0) return false

  for (const player of room.players.values()) {
    if (player.finishedAt === null) {
      if (room.phase === "question" && player.deadline !== null && now >= player.deadline) {
        expirePlayer(room, player, now)
      }
      if (player.finishedAt === null) return false
    }
  }

  room.phase = "finished"
  room.endedAt = now
  room.questionDeadline = null
  room.version += 1
  archiveFinishedRoom(room)
  return true
}

/** Maju satu soal untuk mode `live` (dipakai next & advance). */
function advanceLive(room, now) {
  const nextIndex = room.currentIndex + 1

  if (nextIndex >= room.questions.length) {
    room.phase = "finished"
    room.questionDeadline = null
    room.endedAt = now
    room.version += 1
    archiveFinishedRoom(room)
    return room
  }

  room.currentIndex = nextIndex
  room.phase = "question"
  room.questionStartedAt = now
  room.questionDeadline = liveDeadline(room, now, nextIndex)
  room.extendsUsed = 0
  room.version += 1

  return room
}

/**
 * Lanjut ke soal berikutnya, atau tutup kuis bila sudah soal terakhir.
 *
 * Host TIDAK boleh melompati soal yang masih berjalan: selama deadline belum
 * lewat, permintaan ditolak. Kalau deadline sudah lewat, host boleh lanjut
 * tanpa harus menunggu reveal terjadi lebih dulu. Mode `exam` tidak mengenal
 * "soal berikutnya" — tiap pemain mengatur langkahnya sendiri (409).
 *
 * @returns {{ ok: true, phase: string, currentIndex: number, version: number }
 *          | { error: string, code: number }}
 */
export function nextQuestion(code, hostToken) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }

  if (room.mode === "exam") {
    return { error: "Mode ujian berjalan sendiri per pemain.", code: 409 }
  }
  if (room.phase === "finished") {
    return { error: "Kuis sudah selesai.", code: 409 }
  }
  if (room.phase === "lobby") {
    return { error: "Kuis belum dimulai.", code: 409 }
  }

  const now = Date.now()

  if (room.phase === "question" && room.questionDeadline !== null && now < room.questionDeadline) {
    return { error: "Soal masih berjalan.", code: 409 }
  }

  advanceLive(room, now)

  return { ok: true, phase: room.phase, currentIndex: room.currentIndex, version: room.version }
}

/**
 * `advance` — sama seperti "Soal Berikutnya", tapi SELALU diizinkan walau waktu
 * soal masih berjalan. Bedanya hanya pada penjaga itu: pipeline-nya identik
 * (lewat advanceLive) supaya tidak ada dua jalur yang bisa menyimpang.
 *
 * @returns {{ ok: true, phase: string, currentIndex: number, version: number }
 *          | { error: string, code: number }}
 */
export function advanceQuestion(code, hostToken) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }

  if (room.mode === "exam") {
    return { error: "Mode ujian berjalan sendiri per pemain.", code: 409 }
  }
  if (room.phase === "finished") return { error: "Kuis sudah selesai.", code: 409 }
  if (room.phase === "lobby") return { error: "Kuis belum dimulai.", code: 409 }

  advanceLive(room, Date.now())

  return { ok: true, phase: room.phase, currentIndex: room.currentIndex, version: room.version }
}

/**
 * Host memperpanjang waktu soal aktif (+amountSec detik).
 *
 * PENTING: hanya `questionDeadline` yang digeser — `questionStartedAt` TIDAK
 * disentuh. Bonus kecepatan tetap dihitung dari durasi ASLI soal, jadi pemain
 * yang menjawab sebelum perpanjangan tetap mendapat bonus penuh (adil).
 *
 * @returns {{ ok: true, secondsLeft: number, questionDeadline: number, version: number }
 *          | { error: string, code: number }}
 */
export function extendQuestion(code, hostToken, amountSec = EXTEND_AMOUNT_SEC) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }

  if (room.mode === "exam") {
    return { error: "Mode ujian berjalan sendiri per pemain.", code: 409 }
  }
  if (room.phase !== "question") {
    return { error: "Tidak ada soal yang berjalan.", code: 409 }
  }
  const now = Date.now()
  // Mencegah "menghidupkan" soal yang sudah lewat deadline tapi belum pernah
  // di-poll siapa pun (belum dipindah closeExpiredQuestions ke reveal).
  if (room.questionDeadline === null || now >= room.questionDeadline) {
    return { error: "Waktu soal sudah habis.", code: 409 }
  }

  if (!Number.isInteger(amountSec) || amountSec < 1 || amountSec > 60) {
    return { error: "Perpanjangan harus 1–60 detik.", code: 400 }
  }
  if (room.extendsUsed >= MAX_EXTEND_PER_QUESTION) {
    return { error: "Batas perpanjangan soal ini sudah tercapai.", code: 409 }
  }

  room.questionDeadline += amountSec * 1000
  room.extendsUsed += 1
  room.version += 1

  return {
    ok: true,
    secondsLeft: Math.max(0, Math.ceil((room.questionDeadline - now) / 1000)),
    questionDeadline: room.questionDeadline,
    version: room.version,
  }
}

/**
 * Host MELEWATI soal aktif: paksa fase question → reveal sekarang.
 *
 * Semantik yang dipilih: skip TIDAK langsung pindah soal — soal masuk fase
 * reveal dulu (distribusi, penanda benar/salah, "Tidak menjawab" tampil seperti
 * biasa), lalu host menekan "Soal Berikutnya" seperti alur normal. Alasan:
 * memakai ulang pipeline reveal yang sudah teruji tanpa logika baru, dan guard
 * nextQuestion "Soal masih berjalan." tetap menjaga klik tidak disengaja.
 *
 * @returns {{ ok: true, phase: string, currentIndex: number, version: number }
 *          | { error: string, code: number }}
 */
export function skipQuestion(code, hostToken) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }

  if (room.mode === "exam") {
    return { error: "Mode ujian berjalan sendiri per pemain.", code: 409 }
  }
  if (room.phase !== "question") {
    return { error: "Tidak ada soal yang bisa dilewati.", code: 409 }
  }

  room.skippedIndexes.add(room.currentIndex)
  room.phase = "reveal"
  room.version += 1

  return { ok: true, phase: room.phase, currentIndex: room.currentIndex, version: room.version }
}

// ═══════════════════════════════════════════════════════════════════════════
// KONTROL SESI (end / kick / lock / restart)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Akhiri sesi SEKARANG dari fase apa pun.
 *
 * Hasil akhir dihitung lebih dulu (sebelum arsip) supaya angka yang tersimpan
 * di `rooms_archive` persis sama dengan yang dilihat host di layar.
 * Kegagalan menulis arsip TIDAK BOLEH menggagalkan pengakhiran sesi — sesi
 * sudah berakhir secara logis, dan memblokirnya hanya membuat host terjebak.
 *
 * @returns {{ ok: true, version: number } | { error: string, code: number }}
 */
export function endSession(code, hostToken) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }

  const now = Date.now()

  if (room.mode === "exam") {
    for (const player of room.players.values()) {
      if (player.finishedAt === null) {
        player.finishedAt = now
        player.deadline = null
      }
    }
  }

  if (room.phase !== "finished") {
    room.phase = "finished"
    room.questionDeadline = null
    room.endedAt = now
    room.version += 1
    archiveFinishedRoom(room)
  }

  return { ok: true, version: room.version }
}

/**
 * Keluarkan pemain dari room. Tokennya langsung tidak berlaku karena barisnya
 * benar-benar dihapus dari Map, termasuk SEMUA jawabannya (kalau jawaban lama
 * dibiarkan, laporan per soal tetap menghitung orang yang sudah dikeluarkan).
 *
 * @returns {{ ok: true, version: number } | { error: string, code: number }}
 */
export function kickPlayer(code, hostToken, playerId) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }
  if (typeof playerId !== "string" || playerId === "") {
    return { error: "playerId wajib dikirim.", code: 400 }
  }
  if (!room.players.has(playerId)) {
    return { error: "Pemain tidak ditemukan.", code: 404 }
  }

  room.players.delete(playerId)
  const suffix = `:${playerId}`
  for (const key of Array.from(room.answers.keys())) {
    if (key.endsWith(suffix)) room.answers.delete(key)
  }
  room.version += 1

  return { ok: true, version: room.version }
}

/**
 * Kunci / buka lobby. Saat terkunci, `joinRoom` menolak dengan 409.
 *
 * @returns {{ ok: true, version: number } | { error: string, code: number }}
 */
export function setLocked(code, hostToken, locked) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }
  if (typeof locked !== "boolean") {
    return { error: 'Field "locked" wajib berupa boolean.', code: 400 }
  }

  room.locked = locked
  room.version += 1

  return { ok: true, version: room.version }
}

/**
 * Ulangi kuis: skor, jawaban, dan progres semua pemain dibersihkan, room
 * kembali ke lobby. SOAL TETAP (termasuk hasil undian durasi mode "random" —
 * kontrak mengunci undian pada saat room dibuat, jadi tidak diundi ulang).
 *
 * @returns {{ ok: true, version: number } | { error: string, code: number }}
 */
export function restartRoom(code, hostToken) {
  const room = getRoom(code)
  if (!room) return { error: "Room tidak ditemukan.", code: 404 }
  if (!isHost(room, hostToken)) return { error: "Token host tidak valid.", code: 403 }

  room.answers = new Map()
  room.extendsUsed = 0
  room.skippedIndexes = new Set()
  room.phase = "lobby"
  room.currentIndex = -1
  room.questionStartedAt = null
  room.questionDeadline = null
  room.startedAt = null
  room.endedAt = null
  room.archiveCode = null

  const now = Date.now()
  for (const player of room.players.values()) {
    player.score = 0
    player.index = 0
    player.deadline = null
    player.startedAt = null
    player.finishedAt = null
    player.correctCount = 0
    player.wrongCount = 0
    player.unansweredCount = 0
    player.lastAnswerAt = null
    player.connectedAt = now
  }

  room.version += 1

  return { ok: true, version: room.version }
}

// ═══════════════════════════════════════════════════════════════════════════
// PEMELIHARAAN STATE (dipanggil lazy dari GET state & POST /api/rooms)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tutup soal yang waktunya sudah habis.
 *
 * Mode `live`: `question` → `reveal` (perilaku lama). Ini yang membuat fase
 * reveal muncul OTOMATIS tanpa aksi host.
 *
 * Mode `exam`: pemain yang deadline-nya lewat dicatat TIDAK MENJAWAB, lalu
 * otomatis pindah ke soal berikutnya; soal terakhir lewat → pemain selesai.
 * Bila semua pemain selesai, fase room menjadi `finished`.
 *
 * Dipanggil di awal setiap GET state, jadi begitu ada satu klien yang polling
 * setelah deadline, seluruh room ikut maju.
 *
 * @returns {number} jumlah room yang berubah
 */
export function closeExpiredQuestions() {
  const now = Date.now()
  let changed = 0

  for (const room of rooms.values()) {
    if (room.phase !== "question") continue

    if (room.mode === "exam") {
      for (const player of room.players.values()) {
        if (player.finishedAt !== null) continue
        if (player.deadline === null) continue
        if (now < player.deadline + ANSWER_GRACE_MS) continue
        if (expirePlayer(room, player, now)) {
          room.version += 1
          changed += 1
        }
      }
      // finalizeExamRoom menambah version sendiri bila fase berubah.
      finalizeExamRoom(room, now)
      continue
    }

    if (room.questionDeadline === null) continue
    if (now < room.questionDeadline + ANSWER_GRACE_MS) continue

    room.phase = "reveal"
    room.version += 1
    changed += 1
  }

  return changed
}

/**
 * Buang room yang tidak ada aktivitas melewati ROOM_TTL_MS (3 jam).
 *
 * WAJIB: tanpa ini Map `rooms` tumbuh selamanya dan proses Node akhirnya
 * kehabisan memori — tidak ada yang lain yang membersihkan room, karena
 * tidak ada database yang punya TTL. Dipanggil lazy (bukan setInterval)
 * supaya tidak menahan proses tetap hidup dan tidak perlu di-cleanup saat
 * hot-reload.
 *
 * TTL dihitung dari `lastActivityAt` (bukan `createdAt`): room yang masih
 * dipakai — termasuk ujian panjang — TIDAK dihapus di tengah sesi. Room yang
 * benar-benar ditinggalkan tetap dibuang setelah 3 jam sejak request terakhir.
 *
 * @returns {number} jumlah room yang dibuang
 */
export function pruneRooms() {
  const now = Date.now()
  let removed = 0

  for (const [code, room] of rooms) {
    const lastSeen = room.lastActivityAt ?? room.createdAt
    if (now - lastSeen > ROOM_TTL_MS) {
      rooms.delete(code)
      removed += 1
    }
  }

  return removed
}

/** Jumlah room aktif — dipakai untuk diagnosa/log, bukan untuk klien. */
export function roomCount() {
  return rooms.size
}

// ═══════════════════════════════════════════════════════════════════════════
/**
 * Tulis ringkasan sesi yang sudah berakhir ke `rooms_archive`.
 *
 * DIBUNGKUS try/catch dengan sengaja: satu-satunya hal yang lebih buruk
 * daripada arsip yang gagal adalah sesi yang tidak bisa diakhiri. Host tetap
 * melihat hasil di layar; yang hilang hanya riwayat di disk.
 */
function archiveFinishedRoom(room) {
  try {
    const results = buildResults(room, null)
    const report = roomReportFor(room)
    archiveRoom({
      code: room.code,
      hostUser: room.hostUser,
      title: room.title,
      mode: room.mode,
      settings: room.settings,
      summary: { results, report },
      playerCount: room.players.size,
      // rooms_archive.started_at bertipe DATETIME (teks "YYYY-MM-DD HH:MM:SS").
      startedAt: new Date(room.startedAt ?? room.createdAt)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
    })
  } catch {
    // Sengaja diabaikan — lihat penjelasan di atas.
  }
}

// DEFAULT_SETTINGS ikut di-re-export di atas; baris ini menjaga agar nilai
// default tetap terpakai bila ada kode yang mengimpornya dari modul ini.
export const ROOM_DEFAULT_SETTINGS = DEFAULT_SETTINGS