import * as store from "../../src/lib/quiz-store.js"
import * as db from "../../src/lib/db.js"
import { examQuestions } from "../test-fixtures.mjs"
// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("6. overhaul — keamanan & fitur baru")

test("auth: registrasi publik menolak peran admin, menerima guru/siswa", async () => {
  const { validatePublicRole, validatePublicAccount, validateRole } = await import(
    "../src/lib/auth.js"
  )
  assert.equal(validatePublicRole("admin"), "Peran yang bisa dipilih hanya guru atau siswa.")
  assert.equal(validatePublicRole("guru"), null)
  assert.equal(validatePublicRole("siswa"), null)
  // validateRole yang lebih luas tetap menerima admin (dipakai panel admin).
  assert.equal(validateRole("admin"), null)

  const err = validatePublicAccount({ name: "Hacker", pin: "123456", role: "admin", kelas: null })
  assert.match(err, /guru atau siswa/)
})

test("joinRoom menolak saat pemain mencapai MAX_PLAYERS_PER_ROOM", () => {
  const { room } = store.createRoom({ title: "Penuh", questions: examQuestions() })
  // Isi sampai batas tanpa membuat 200 pemain sungguhan: paksa size lewat Map.
  const limit = store.MAX_PLAYERS_PER_ROOM
  for (let i = 0; i < limit; i += 1) {
    room.players.set(`p${i}`, { id: `p${i}`, name: `Pemain ${i}`, token: "t" })
  }
  const result = store.joinRoom(room.code, "Terlambat")
  assert.equal(result.code, 409)
  assert.match(result.error, /penuh/)
})

test("exam: you.rank disembunyikan selama ujian, terbuka setelah selesai", () => {
  const { room } = store.createRoom({
    title: "Rank",
    questions: examQuestions(),
    settings: { mode: "exam", scoringMode: "exam", instantFeedback: false, showExplanation: false },
  })
  const a = store.joinRoom(room.code, "Ana").player
  const b = store.joinRoom(room.code, "Beni").player
  store.startQuiz(room.code, room.hostToken)

  // Ana menjawab benar soal 0; Beni belum. Kalau rank dikirim, Ana tahu ia unggul.
  store.submitAnswer(room.code, {
    playerId: a.id, token: a.token, questionIndex: 0, optionIndex: 0,
  })

  const mid = store.publicState(room, { kind: "player", playerId: a.id })
  assert.equal(mid.you.rank, null, "rank bocor sebelum ujian selesai")
  assert.equal(mid.you.score, 0, "skor bocor sebelum ujian selesai")

  // Selesaikan Ana.
  store.submitAnswer(room.code, { playerId: a.id, token: a.token, questionIndex: 1, optionIndex: 1 })
  store.submitAnswer(room.code, { playerId: a.id, token: a.token, questionIndex: 2, optionIndex: 2 })
  const done = store.publicState(room, { kind: "player", playerId: a.id })
  assert.equal(done.you.finished, true)
  assert.equal(typeof done.you.rank, "number")
  assert.equal(done.you.rank, 1)
})

test("publicState anonim TIDAK menerima results/roster/playerStates", () => {
  const { room } = store.createRoom({
    title: "Privasi",
    questions: examQuestions(),
    settings: { mode: "exam", scoringMode: "exam" },
  })
  const p = store.joinRoom(room.code, "Cici").player
  store.startQuiz(room.code, room.hostToken)
  store.submitAnswer(room.code, { playerId: p.id, token: p.token, questionIndex: 0, optionIndex: 0 })
  store.submitAnswer(room.code, { playerId: p.id, token: p.token, questionIndex: 1, optionIndex: 1 })
  store.submitAnswer(room.code, { playerId: p.id, token: p.token, questionIndex: 2, optionIndex: 2 })
  assert.equal(room.phase, "finished")

  const anon = store.publicState(room, null)
  assert.equal(anon.results, null)
  assert.equal(anon.roster, null)
  assert.equal(anon.playerStates, null)

  const host = store.publicState(room, { kind: "host" })
  assert.ok(host.results)
  assert.ok(host.roster)
  assert.ok(host.playerStates)
})

test("mode live: reveal memuat explanation; results.perQuestion memuat explanation", () => {
  const { room } = store.createRoom({ title: "Expl", questions: examQuestions() })
  const p = store.joinRoom(room.code, "Dodi").player
  store.startQuiz(room.code, room.hostToken)
  store.submitAnswer(room.code, { playerId: p.id, token: p.token, questionIndex: 0, optionIndex: 0 })

  // Paksa soal habis → reveal.
  room.questionDeadline = Date.now() - (store.ANSWER_GRACE_MS + 500)
  store.closeExpiredQuestions()
  assert.equal(room.phase, "reveal")
  const reveal = store.publicState(room, { kind: "player", playerId: p.id })
  assert.equal(reveal.reveal.explanation, "Penjelasan satu.")

  // Akhiri sesi → finished; perQuestion memuat explanation.
  store.endSession(room.code, room.hostToken)
  const fin = store.publicState(room, { kind: "host" })
  assert.equal(fin.results.perQuestion[0].explanation, "Penjelasan satu.")
})

test("db: listUploadsByOwner + deleteUploadForOwner (dengan owner check)", () => {
  const owner = db.findUserByName("Bu Rina")
  const other = db.findUserByName("Budi")

  db.insertUpload({ id: "a".repeat(32), ownerId: owner.id, ext: "png", bytes: 100 })
  db.insertUpload({ id: "b".repeat(32), ownerId: owner.id, ext: "jpg", bytes: 200 })

  const listed = db.listUploadsByOwner(owner.id)
  assert.equal(listed.length, 2)

  // Pemilik lain TIDAK bisa menghapus.
  assert.equal(db.deleteUploadForOwner("a".repeat(32), other.id), false)
  assert.equal(db.listUploadsByOwner(owner.id).length, 2)

  // Pemilik sendiri bisa.
  assert.equal(db.deleteUploadForOwner("a".repeat(32), owner.id), true)
  assert.equal(db.listUploadsByOwner(owner.id).length, 1)
})

test("db: deleteArchivedRoom menghormati host_user", () => {
  const host = db.findUserByName("Bu Rina")
  const other = db.findUserByName("Budi")

  db.archiveRoom({
    code: "ARC111", hostUser: host.id, title: "Arsip", mode: "live",
    settings: {}, summary: { results: { averageGrade: 80, perPlayer: [] } }, playerCount: 3,
  })
  assert.ok(db.getArchivedRoom("ARC111"))

  // Host lain tidak bisa menghapus.
  assert.equal(db.deleteArchivedRoom("ARC111", other.id), false)
  assert.ok(db.getArchivedRoom("ARC111"))

  // Host sendiri bisa.
  assert.equal(db.deleteArchivedRoom("ARC111", host.id), true)
  assert.equal(db.getArchivedRoom("ARC111"), null)
})

test("quiz-ui: OPTION_LETTERS & formatClock", async () => {
  const { OPTION_LETTERS, formatClock } = await import("../src/lib/quiz-ui.js")
  assert.deepEqual(OPTION_LETTERS, ["A", "B", "C", "D"])
  assert.equal(formatClock(0), "0:00")
  assert.equal(formatClock(65), "1:05")
  assert.equal(formatClock(600), "10:00")
  assert.equal(formatClock(null), "0:00")
})

// ═══════════════════════════════════════════════════════════════════════════
section("7. putaran 4 — privasi, TTL aktivitas, grace, filter")

test("publicState anonim TIDAK menerima leaderboard/players (lobby & reveal)", () => {
  const { room } = store.createRoom({ title: "Privasi2", questions: examQuestions() })
  const p = store.joinRoom(room.code, "Eka").player

  // Lobby: anonim tidak boleh lihat daftar nama.
  const lobbyAnon = store.publicState(room, null)
  assert.equal(lobbyAnon.players, null)
  assert.equal(lobbyAnon.leaderboard, null)
  const lobbyHost = store.publicState(room, { kind: "host" })
  assert.ok(Array.isArray(lobbyHost.players))

  // Reveal: anonim tidak boleh lihat leaderboard (nama + skor semua pemain).
  store.startQuiz(room.code, room.hostToken)
  store.submitAnswer(room.code, { playerId: p.id, token: p.token, questionIndex: 0, optionIndex: 0 })
  room.questionDeadline = Date.now() - (store.ANSWER_GRACE_MS + 500)
  store.closeExpiredQuestions()
  assert.equal(room.phase, "reveal")
  assert.equal(store.publicState(room, null).leaderboard, null)
  assert.ok(store.publicState(room, { kind: "host" }).leaderboard)
  assert.ok(store.publicState(room, { kind: "player", playerId: p.id }).leaderboard)
})

test("pruneRooms memakai aktivitas terakhir, bukan createdAt", () => {
  const { room } = store.createRoom({ title: "TTL", questions: examQuestions() })
  // Room dibuat lama, TAPI baru saja diakses.
  room.createdAt = Date.now() - (store.ROOM_TTL_MS + 60_000)
  room.lastActivityAt = Date.now()
  const removed = store.pruneRooms()
  assert.equal(store.getRoom(room.code) !== null, true, "room aktif tidak boleh dihapus")
  assert.ok(removed >= 0)

  // Sekarang biarkan benar-benar menganggur.
  room.lastActivityAt = Date.now() - (store.ROOM_TTL_MS + 1000)
  store.pruneRooms()
  assert.equal(store.getRoom(room.code), null, "room menganggur harus dibuang")
})

test("grace period: jawaban tepat setelah deadline masih diterima", () => {
  const { room } = store.createRoom({ title: "Grace", questions: examQuestions() })
  const p = store.joinRoom(room.code, "Fajar").player
  store.startQuiz(room.code, room.hostToken)
  store.submitAnswer(room.code, { playerId: p.id, token: p.token, questionIndex: 0, optionIndex: 0 })

  // Lewati soal lalu set deadline sedikit di masa lalu, di dalam jendela grace.
  room.currentIndex = 1
  room.phase = "question"
  room.questionDeadline = Date.now() - 300 // < ANSWER_GRACE_MS
  const result = store.submitAnswer(room.code, {
    playerId: p.id, token: p.token, questionIndex: 1, optionIndex: 1,
  })
  assert.equal(result.ok, true, "jawaban dalam grace harus diterima")
  assert.equal(result.alreadyAnswered, false)
})

test("grace period: jawaban jauh setelah deadline tetap ditolak", () => {
  const { room } = store.createRoom({ title: "Grace2", questions: examQuestions() })
  const p = store.joinRoom(room.code, "Gita").player
  store.startQuiz(room.code, room.hostToken)
  room.currentIndex = 1
  room.phase = "question"
  room.questionDeadline = Date.now() - (store.ANSWER_GRACE_MS + 5000)
  const result = store.submitAnswer(room.code, {
    playerId: p.id, token: p.token, questionIndex: 1, optionIndex: 1,
  })
  assert.equal(result.code, 409)
  assert.match(result.error, /habis/i)
})

test("db: filter tag tidak memakai wildcard LIKE dari input", () => {
  const owner = db.findUserByName("Bu Rina")
  db.insertTemplate({
    ownerId: owner.id, title: "Tag Test", category: "umum",
    subject: "Umum", gradeLevel: null, tags: ["abc"], coverImage: null,
    visibility: "public", settings: {}, questions: [{ text: "q", options: ["a","b","c","d"], correctIndex: 0 }],
  })
  // "%" sebagai tag tidak boleh cocok dengan semua (LIKE di-escape).
  const wildcard = db.listTemplates({ publicOnly: true, tag: "%" })
  assert.equal(wildcard.length, 0, "wildcard % tidak boleh mencocokkan semua")
  const exact = db.listTemplates({ publicOnly: true, tag: "abc" })
  assert.equal(exact.length, 1)
})

// ═══════════════════════════════════════════════════════════════════════════
