import { gradeFor, scoreForMode, scoreFor, summarizePlayer, rankSummaries, buildLeaderboard } from "../../src/lib/scoring.js"
// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("1. scoring.js")

test("gradeFor(17, 20) === 85", () => {
  assert.equal(gradeFor(17, 20), 85)
})

test("gradeFor menangani total 0 / nilai aneh", () => {
  assert.equal(gradeFor(0, 0), 0)
  assert.equal(gradeFor(5, -1), 0)
  assert.equal(gradeFor(0, 10), 0)
  assert.equal(gradeFor(10, 10), 100)
})

test("scoreForMode competitive memakai rumus lama (1000 + bonus kecepatan)", () => {
  const full = scoreForMode({ correct: true, remainingMs: 30_000, totalMs: 30_000, scoringMode: "competitive" })
  const half = scoreForMode({ correct: true, remainingMs: 15_000, totalMs: 30_000, scoringMode: "competitive" })
  const wrong = scoreForMode({ correct: false, remainingMs: 30_000, totalMs: 30_000, scoringMode: "competitive" })
  assert.equal(full, 2000)
  assert.equal(half, 1500)
  assert.equal(wrong, 0)
  // Harus identik dengan scoreFor() lama.
  assert.equal(full, scoreFor({ correct: true, remainingMs: 30_000, totalMs: 30_000 }))
})

test("scoreForMode exam: 1 poin per jawaban benar, TANPA bonus kecepatan", () => {
  const fast = scoreForMode({ correct: true, remainingMs: 30_000, totalMs: 30_000, scoringMode: "exam" })
  const slow = scoreForMode({ correct: true, remainingMs: 1, totalMs: 30_000, scoringMode: "exam" })
  const wrong = scoreForMode({ correct: false, remainingMs: 30_000, totalMs: 30_000, scoringMode: "exam" })
  assert.equal(fast, 1)
  assert.equal(slow, 1)
  assert.equal(wrong, 0)
})

test("summarizePlayer: 17 benar, 2 salah, 1 kosong dari 20 soal", () => {
  const answers = [
    ...Array.from({ length: 17 }, () => ({ correct: true })),
    ...Array.from({ length: 2 }, () => ({ correct: false })),
  ]
  const row = summarizePlayer({
    playerId: "p1",
    name: "Budi",
    score: 17,
    answers,
    totalQuestions: 20,
    passingScore: 70,
    secondsUsed: 431,
  })
  assert.equal(row.correct, 17)
  assert.equal(row.wrong, 2)
  assert.equal(row.unanswered, 1)
  assert.equal(row.total, 20)
  assert.equal(row.grade, 85)
  assert.equal(row.passed, true)
  assert.equal(row.secondsUsed, 431)
  assert.equal(row.name, "Budi")
  assert.equal(row.playerId, "p1")
})

test("summarizePlayer: di bawah passingScore → passed false", () => {
  const row = summarizePlayer({
    playerId: "p2",
    name: "Sari",
    score: 5,
    answers: Array.from({ length: 5 }, () => ({ correct: true })),
    totalQuestions: 10,
    passingScore: 70,
    secondsUsed: 60,
  })
  assert.equal(row.grade, 50)
  assert.equal(row.passed, false)
  assert.equal(row.unanswered, 5)
})

test("rankSummaries: seri mendapat peringkat sama, tie-break waktu lalu nama", () => {
  const rows = [
    { playerId: "a", name: "Budi", score: 5, secondsUsed: 100, grade: 50, correct: 5, wrong: 0, unanswered: 0, total: 10, passed: false },
    { playerId: "b", name: "Sari", score: 5, secondsUsed: 90, grade: 50, correct: 5, wrong: 0, unanswered: 0, total: 10, passed: false },
    { playerId: "c", name: "Nina", score: 9, secondsUsed: 200, grade: 90, correct: 9, wrong: 0, unanswered: 0, total: 10, passed: true },
    { playerId: "d", name: "Rudi", score: 5, secondsUsed: 90, grade: 50, correct: 5, wrong: 0, unanswered: 0, total: 10, passed: false },
  ]
  const ranked = rankSummaries(rows)

  assert.equal(ranked[0].playerId, "c")
  assert.equal(ranked[0].rank, 1)

  // Sari & Rudi sama-sama 90 detik → tie-break nama: Rudi sebelum Sari.
  assert.equal(ranked[1].name, "Rudi")
  assert.equal(ranked[2].name, "Sari")
  assert.equal(ranked[3].name, "Budi")

  // Ketiganya skor 5 → peringkat DENSE yang sama (2), bukan 2/3/4.
  assert.equal(ranked[1].rank, 2)
  assert.equal(ranked[2].rank, 2)
  assert.equal(ranked[3].rank, 2)

  // Input asli tidak boleh termutasi.
  assert.equal(rows[0].playerId, "a")
  assert.equal(rows[0].rank, undefined)
})

test("buildLeaderboard & scoreFor lama TIDAK berubah perilakunya", () => {
  const board = buildLeaderboard([
    { id: "x", name: "X", score: 10, joinedAt: 2 },
    { id: "y", name: "Y", score: 20, joinedAt: 1 },
    { id: "z", name: "Z", score: 20, joinedAt: 3 },
  ])
  assert.deepEqual(board, [
    { playerId: "y", name: "Y", score: 20, rank: 1 },
    { playerId: "z", name: "Z", score: 20, rank: 1 },
    { playerId: "x", name: "X", score: 10, rank: 3 },
  ])
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. UPLOADS
// ═══════════════════════════════════════════════════════════════════════════
