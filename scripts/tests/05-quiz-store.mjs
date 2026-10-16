import * as store from "../../src/lib/quiz-store.js"
import * as db from "../../src/lib/db.js"
import { examQuestions } from "../test-fixtures.mjs"
// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("5. quiz-store.js — createRoom/startQuiz/submitAnswer mode exam")


test("createRoom menyimpan settings lengkap & mode", () => {
  const { room } = store.createRoom({
    title: "Ujian Bab 1",
    questions: examQuestions(),
    settings: {
      mode: "exam",
      timeMode: "per-question",
      scoringMode: "exam",
      instantFeedback: false,
      showExplanation: false,
      passingScore: 70,
    },
  })

  assert.equal(room.mode, "exam")
  assert.equal(room.settings.mode, "exam")
  assert.equal(room.settings.scoringMode, "exam")
  assert.equal(room.settings.instantFeedback, false)
  assert.equal(room.settings.totalTimeSec, 600) // default terisi
  assert.equal(room.phase, "lobby")
  assert.equal(room.locked, false)
  assert.equal(room.questions.length, 3)
})

test("createRoom timeMode random: durasi diundi sekali dan dikunci", () => {
  const { room } = store.createRoom({
    title: "Undian",
    questions: examQuestions(),
    settings: { timeMode: "random", randomMinSec: 10, randomMaxSec: 12 },
  })

  assert.equal(room.rolledTimes.length, 3)
  for (const seconds of room.rolledTimes) {
    assert.ok(seconds >= 10 && seconds <= 12, `durasi ${seconds} di luar rentang 10–12`)
  }
  room.questions.forEach((question, index) => {
    assert.equal(question.timeSec, room.rolledTimes[index])
  })
})

test("createRoom shuffleOptions memperbaiki correctIndex tanpa memutasi input", () => {
  const questions = [
    { text: "S", options: ["A", "B", "C", "D"], correctIndex: 2, timeSec: 20 },
    { text: "T", options: ["E", "F", "G", "H"], correctIndex: 0, timeSec: 20 },
  ]
  const snapshot = JSON.stringify(questions)

  const { room } = store.createRoom({
    title: "Acak",
    questions,
    settings: { shuffleOptions: true },
  })

  assert.equal(JSON.stringify(questions), snapshot, "objek input tidak boleh berubah")

  for (const question of room.questions) {
    const original = originalFor(question.text)
    assert.equal(question.options[question.correctIndex], original)
    assert.deepEqual([...question.options].sort(), [...originalOptions(question.text)].sort())
  }
})

function originalFor(text) {
  return text === "S" ? "C" : "E"
}
function originalOptions(text) {
  return text === "S" ? ["A", "B", "C", "D"] : ["E", "F", "G", "H"]
}

test("exam: startQuiz memberi index/deadline/stats per pemain", () => {
  const { room } = store.createRoom({
    title: "Ujian",
    questions: examQuestions(),
    settings: { mode: "exam", scoringMode: "exam", timeMode: "per-question", defaultTimeSec: 30 },
  })

  const a = store.joinRoom(room.code, "Budi")
  const b = store.joinRoom(room.code, "Sari")
  assert.equal(a.error, undefined)
  assert.equal(b.error, undefined)

  const started = store.startQuiz(room.code, room.hostToken)
  assert.equal(started.ok, true)
  assert.equal(room.phase, "question")

  for (const player of [a.player, b.player]) {
    assert.equal(player.index, 0)
    assert.equal(player.correctCount, 0)
    assert.equal(player.wrongCount, 0)
    assert.equal(player.unansweredCount, 0)
    assert.equal(player.finishedAt, null)
    assert.ok(player.startedAt !== null)
    // deadline = startedAt + 20s (timeSec soal pertama)
    assert.ok(player.deadline > player.startedAt)
  }
})

test("exam + instantFeedback:false → balasan TIDAK memuat correctIndex (ANTI-BOCOR)", () => {
  const { room } = store.createRoom({
    title: "Ujian Anti Bocor",
    questions: examQuestions(),
    settings: {
      mode: "exam",
      timeMode: "per-question",
      scoringMode: "exam",
      instantFeedback: false,
      showExplanation: false,
      passingScore: 70,
    },
  })
  assert.equal(room.mode, "exam")

  const joined = store.joinRoom(room.code, "Budi")
  assert.equal(joined.error, undefined)
  const player = joined.player

  const start = store.startQuiz(room.code, room.hostToken)
  assert.equal(start.ok, true)

  // ── Jawaban BENAR pada soal 0 ──
  const correctReply = store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 0,
  })
  assert.equal(correctReply.ok, true)
  assert.equal(correctReply.alreadyAnswered, false)
  assert.equal(correctReply.progress.answered, 1)
  assert.equal(correctReply.nextIndex, 1)
  assert.equal(correctReply.finished, false)

  const correctJson = JSON.stringify(correctReply)
  // ── UJI PALING PENTING ──────────────────────────────────────────────────
  // Kata "correctIndex" tidak boleh muncul di mana pun pada balasan.
  assert.equal(correctJson.includes("correctIndex"), false, `balasan bocor: ${correctJson}`)
  assert.equal(correctJson.includes("explanation"), false, `balasan bocor: ${correctJson}`)
  assert.equal(correctJson.includes("distribution"), false, `balasan bocor: ${correctJson}`)

  // `correct` adalah substring `correctIndex`, jadi cek terpisah diperlukan
  // untuk memastikan field `correct` sendiri tidak ikut terkirim.
  assert.equal("correct" in correctReply, false, `balasan bocor field correct: ${correctJson}`)
  assert.equal("points" in correctReply, false, `balasan bocor field points: ${correctJson}`)
  assert.equal("score" in correctReply, false, `balasan bocor field score: ${correctJson}`)

  // ── `tally` TIDAK BOLEH ikut saat reveal mati ───────────────────────────
  // Ini kebocoran yang paling halus: `tally.correct` naik tepat satu pada
  // jawaban BENAR dan tidak bergerak pada jawaban SALAH. Satu field yang
  // tampak tidak berbahaya, tapi cukup untuk menentukan benar/salah lewat
  // DevTools Network — persis yang harus dicegah di mode ujian.
  assert.equal(
    "tally" in correctReply,
    false,
    `balasan bocor field tally: ${correctJson}`
  )

  // Daftar kunci di level atas harus PERSIS ini. Assertion himpunan ini yang
  // paling kuat: field baru yang bocor (mis. `correct`, `points`, `score`,
  // `tally`, `correctIndex`) langsung menggagalkannya.
  //
  // `progress` TETAP ada dan memang boleh: ia hanya memuat hitungan soal yang
  // sudah dikerjakan + skor yang dipakai layar pemain ("Skor N"). Di mode
  // exam, skor tidak bergerak selama reveal mati (poin hanya dihitung di
  // ringkasan akhir), jadi ia tidak bisa dipakai membedakan benar dari salah.
  const allowedKeys = ["alreadyAnswered", "finished", "nextIndex", "ok", "progress"]
  assert.deepEqual(
    Object.keys(correctReply).sort(),
    allowedKeys,
    `kunci balasan tidak sesuai daftar yang diizinkan: ${correctJson}`
  )

  assert.equal(correctReply.correct, undefined)
  assert.equal(correctReply.correctIndex, undefined)
  assert.equal(correctReply.explanation, undefined)
  assert.equal(correctReply.points, undefined)
  assert.equal(correctReply.distribution, undefined)

  // ── Jawaban SALAH pada soal 1 → bentuk balasan harus IDENTIK ──
  const wrongReply = store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 1,
    optionIndex: 0,
  })
  assert.equal(wrongReply.ok, true)
  const wrongJson = JSON.stringify(wrongReply)
  assert.equal(wrongJson.includes("correctIndex"), false, `balasan bocor: ${wrongJson}`)
  // CATATAN: pencarian substring '"correct"' TIDAK dipakai di sini, karena
  // `tally` (yang diwajibkan CONTRACT §6) memang memuat kunci bernama
  // "correct" — jumlah jawaban benar milik pemain sendiri sejauh ini. Yang
  // menentukan tidak ada kebocoran adalah perbandingan HIMPUNAN KUNCI di
  // bawah: balasan benar dan balasan salah harus berbentuk persis sama.
  assert.deepEqual(
    Object.keys(wrongReply).sort(),
    allowedKeys,
    `kunci balasan salah tidak sesuai daftar yang diizinkan: ${wrongJson}`
  )

  // Kunci field balasan harus sama persis (tidak ada bedanya benar vs salah).
  assert.deepEqual(Object.keys(correctReply).sort(), Object.keys(wrongReply).sort())

  // ── Jawaban BENAR pada soal 2 → tetap sama ──
  const lastReply = store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 2,
    optionIndex: 2,
  })
  assert.equal(lastReply.ok, true)
  assert.equal(lastReply.finished, true)
  assert.equal(lastReply.nextIndex, null)
  assert.equal(JSON.stringify(lastReply).includes("correctIndex"), false)

  // ── publicState sebelum selesai juga tidak boleh membocorkan kunci ──
  assert.equal(player.index, 3)
  assert.equal(player.correctCount, 2)
  assert.equal(player.wrongCount, 1)
  assert.equal(player.finishedAt !== null, true)
})

test("exam: publicState TIDAK PERNAH memuat correctIndex selama fase question", () => {
  const { room } = store.createRoom({
    title: "Ujian State",
    questions: examQuestions(),
    settings: { mode: "exam", scoringMode: "exam", instantFeedback: false, showExplanation: false },
  })

  const joined = store.joinRoom(room.code, "Sari")
  const player = joined.player
  store.startQuiz(room.code, room.hostToken)

  // Sebelum menjawab.
  let json = JSON.stringify(store.publicState(room, { kind: "player", playerId: player.id }))
  assert.equal(json.includes("correctIndex"), false, `state bocor (sebelum jawab): ${json}`)

  // Setelah menjawab soal 0.
  store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 0,
  })
  json = JSON.stringify(store.publicState(room, { kind: "player", playerId: player.id }))
  assert.equal(json.includes("correctIndex"), false, `state bocor (sesudah jawab): ${json}`)

  // State milik host juga tidak boleh memuat kunci selama ujian berjalan.
  json = JSON.stringify(store.publicState(room, { kind: "host" }))
  assert.equal(json.includes("correctIndex"), false, `state host bocor: ${json}`)

  // Sudah selesai → results BOLEH memuat correctIndex (kunci sudah publik).
  store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 1,
    optionIndex: 1,
  })
  store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 2,
    optionIndex: 2,
  })
  const finished = store.publicState(room, { kind: "player", playerId: player.id })
  assert.equal(finished.phase, "finished")
  assert.ok(finished.results)
  assert.equal(finished.results.perPlayer[0].correct, 3)
  assert.equal(finished.results.perPlayer[0].grade, 100)
  assert.equal(finished.results.perPlayer[0].passed, true)
  assert.equal(finished.results.perQuestion[0].correctIndex, 0)
  assert.equal(typeof finished.results.myResult.grade, "number")
})

test("exam: instantFeedback:true → balasan memuat correct & explanation", () => {
  const { room } = store.createRoom({
    title: "Ujian Feedback",
    questions: examQuestions(),
    settings: {
      mode: "exam",
      scoringMode: "exam",
      instantFeedback: true,
      showExplanation: true,
    },
  })
  const player = store.joinRoom(room.code, "Nina").player
  store.startQuiz(room.code, room.hostToken)

  const reply = store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 0,
  })
  assert.equal(reply.correct, true)
  assert.equal(reply.points, 1)
  assert.equal(reply.correctIndex, 0)
  assert.equal(reply.explanation, "Penjelasan satu.")
})

test("exam: jawaban idempotent per (playerId, questionIndex)", () => {
  const { room } = store.createRoom({
    title: "Idempotent",
    questions: examQuestions(),
    settings: { mode: "exam", scoringMode: "exam", instantFeedback: true },
  })
  const player = store.joinRoom(room.code, "Rudi").player
  store.startQuiz(room.code, room.hostToken)

  const first = store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 0,
  })
  assert.equal(first.alreadyAnswered, false)

  const retry = store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 3, // jawaban berbeda pada soal yang sama → diabaikan
  })
  assert.equal(retry.ok, true)
  assert.equal(retry.alreadyAnswered, true)
  assert.equal(retry.score, first.score)
  assert.equal(player.index, 1, "indeks tidak boleh maju dua kali")
})

test("exam: closeExpiredQuestions mencatat tidak menjawab & menyelesaikan pemain", () => {
  const { room } = store.createRoom({
    title: "Habis Waktu",
    questions: examQuestions(),
    settings: { mode: "exam", scoringMode: "exam", timeMode: "per-question", defaultTimeSec: 5 },
  })
  const player = store.joinRoom(room.code, "Telat").player
  store.startQuiz(room.code, room.hostToken)

  // Majukan jam pemain ke masa lalu supaya deadline-nya sudah lewat
  // (melewati ANSWER_GRACE_MS agar benar-benar dianggap habis).
  player.deadline = Date.now() - (store.ANSWER_GRACE_MS + 1000)
  player.startedAt = Date.now() - 60_000

  const changed = store.closeExpiredQuestions()
  assert.ok(changed >= 1)
  assert.equal(player.unansweredCount, 1)

  // Percepat lagi sampai semua soal habis → pemain selesai, room finished.
  const guard = 0
  void guard
  for (let i = 0; i < 5 && player.finishedAt === null; i += 1) {
    if (player.deadline !== null) player.deadline = Date.now() - (store.ANSWER_GRACE_MS + 1000)
    store.closeExpiredQuestions()
  }

  assert.equal(player.finishedAt !== null, true, "pemain harus selesai")
  assert.equal(room.phase, "finished")
  assert.equal(player.unansweredCount, 3)
})

test("mode live tetap berperilaku lama (fase, distribusi, poin kompetitif)", () => {
  const { room } = store.createRoom({
    title: "Live",
    questions: examQuestions(),
    settings: { mode: "live", timeMode: "per-question", scoringMode: "competitive" },
  })
  const a = store.joinRoom(room.code, "Budi").player
  const b = store.joinRoom(room.code, "Sari").player

  assert.equal(store.startQuiz(room.code, room.hostToken).ok, true)
  assert.equal(room.currentIndex, 0)

  const reply = store.submitAnswer(room.code, {
    playerId: a.id,
    token: a.token,
    questionIndex: 0,
    optionIndex: 0,
  })
  assert.equal(reply.ok, true)
  assert.equal(reply.correct, true)
  assert.equal(reply.correctIndex, 0) // mode live: perilaku lama dipertahankan
  assert.equal(reply.distribution[0], 1)
  assert.equal(reply.answeredCount, 1)
  assert.ok(reply.points >= 1000)

  // Pemain kedua menjawab soal yang sama.
  store.submitAnswer(room.code, {
    playerId: b.id,
    token: b.token,
    questionIndex: 0,
    optionIndex: 1,
  })

  // Host tidak boleh maju selagi soal masih berjalan.
  assert.equal(store.nextQuestion(room.code, room.hostToken).code, 409)

  // Lewati grace period agar soal dianggap benar-benar habis.
  room.questionDeadline = Date.now() - (store.ANSWER_GRACE_MS + 500)
  store.closeExpiredQuestions()
  assert.equal(room.phase, "reveal")

  const revealState = store.publicState(room, null)
  assert.equal(revealState.reveal.correctIndex, 0)
  assert.equal(revealState.results, null) // results hanya saat finished

  assert.equal(store.nextQuestion(room.code, room.hostToken).ok, true)
  assert.equal(room.currentIndex, 1)
})

test("mode live: kickPlayer mencabut token & membuang jawabannya", () => {
  const { room } = store.createRoom({
    title: "Kick",
    questions: examQuestions(),
    settings: { mode: "live" },
  })
  const a = store.joinRoom(room.code, "Budi").player

  assert.equal(store.kickPlayer(room.code, room.hostToken, a.id).ok, true)
  assert.equal(room.players.size, 0)
  assert.equal(store.authenticatePlayer(room, a.id, a.token), null)
  assert.equal(store.kickPlayer(room.code, room.hostToken, a.id).code, 404)
})

test("mode live: setLocked menolak join, restartRoom mengosongkan progres", () => {
  const { room } = store.createRoom({ title: "Kunci", questions: examQuestions() })

  assert.equal(store.setLocked(room.code, room.hostToken, true).ok, true)
  const blocked = store.joinRoom(room.code, "Budi")
  assert.equal(blocked.code, 409)
  assert.match(blocked.error, /dikunci/)

  assert.equal(store.setLocked(room.code, room.hostToken, false).ok, true)
  const player = store.joinRoom(room.code, "Budi").player

  store.startQuiz(room.code, room.hostToken)
  store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 0,
  })
  assert.ok(player.score > 0)

  const versionBefore = room.version
  assert.equal(store.restartRoom(room.code, room.hostToken).ok, true)
  assert.equal(room.phase, "lobby")
  assert.equal(room.currentIndex, -1)
  assert.equal(room.answers.size, 0)
  assert.equal(player.score, 0)
  assert.ok(room.version > versionBefore)
})

test("mode live: advanceQuestion memaksa lanjut, exam menolak 409", () => {
  const live = store.createRoom({ title: "Advance", questions: examQuestions() })
  live.room.players.set("x", {
    id: "x",
    name: "X",
    token: "t",
    score: 0,
    joinedAt: 0,
    connectedAt: 0,
    index: 0,
    deadline: null,
    startedAt: null,
    finishedAt: null,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    lastAnswerAt: null,
  })
  store.startQuiz(live.room.code, live.room.hostToken)
  assert.equal(live.room.phase, "question")
  assert.equal(store.advanceQuestion(live.room.code, live.room.hostToken).ok, true)
  assert.equal(live.room.currentIndex, 1)

  const exam = store.createRoom({
    title: "Advance Exam",
    questions: examQuestions(),
    settings: { mode: "exam" },
  })
  assert.equal(store.advanceQuestion(exam.room.code, exam.room.hostToken).code, 409)
  assert.equal(store.nextQuestion(exam.room.code, exam.room.hostToken).code, 409)
})

test("endSession mengakhiri dari fase apa pun & mengarsipkan ke SQLite", async () => {
  const { room } = store.createRoom({
    title: "Sesi Diarsipkan",
    questions: examQuestions(),
    settings: { mode: "live", scoringMode: "competitive" },
    hostUser: db.findUserByName("Bu Rina").id,
  })
  const player = store.joinRoom(room.code, "Budi").player
  store.startQuiz(room.code, room.hostToken)
  store.submitAnswer(room.code, {
    playerId: player.id,
    token: player.token,
    questionIndex: 0,
    optionIndex: 0,
  })

  const ended = store.endSession(room.code, room.hostToken)
  assert.equal(ended.ok, true)
  assert.equal(room.phase, "finished")

  const state = store.publicState(room, { kind: "host" })
  assert.ok(state.results)
  assert.equal(state.report.totalPlayers, 1)
  assert.equal(state.report.totalQuestions, 3)
  assert.equal(state.report.averageScore, player.score)
  assert.equal(state.report.totalAnswered, 1)
  assert.equal(state.report.totalCorrect, 1)
  assert.equal(state.report.accuracyPercent, 100)

  const archived = db.getArchivedRoom(room.code)
  assert.ok(archived, "sesi harus terarsip di rooms_archive")
  assert.equal(archived.title, "Sesi Diarsipkan")
  assert.equal(archived.playerCount, 1)
  assert.equal(archived.summary.results.perPlayer[0].name, "Budi")
  assert.equal(archived.summary.results.perPlayer[0].correct, 1)
  assert.equal(archived.summary.report.totalQuestions, 3)
})

test("pruneRooms membuang room yang lebih tua dari TTL", () => {
  const { room } = store.createRoom({ title: "Tua", questions: examQuestions() })
  // TTL dihitung dari aktivitas terakhir — set keduanya ke masa lalu.
  room.createdAt = Date.now() - (store.ROOM_TTL_MS + 1000)
  room.lastActivityAt = room.createdAt
  const before = store.roomCount()
  const removed = store.pruneRooms()
  assert.ok(removed >= 1)
  assert.equal(store.getRoom(room.code), null)
  assert.ok(store.roomCount() < before)
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. OVERHAUL — keamanan & fitur baru
// ═══════════════════════════════════════════════════════════════════════════
