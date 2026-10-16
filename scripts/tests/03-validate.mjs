import { normalizeSettings, validateRoomInput, validateTemplateInput, validateDraft, DEFAULT_SETTINGS } from "../../src/lib/quiz-validate.js"
// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("3. quiz-validate.js")

test("DEFAULT_SETTINGS lengkap sesuai CONTRACT §1", () => {
  assert.deepEqual(DEFAULT_SETTINGS, {
    mode: "live",
    timeMode: "per-question",
    defaultTimeSec: 30,
    randomMinSec: 10,
    randomMaxSec: 60,
    totalTimeSec: 600,
    scoringMode: "competitive",
    instantFeedback: false,
    showExplanation: false,
    shuffleQuestions: false,
    shuffleOptions: false,
    passingScore: 70,
    allowBack: false,
  })
})

test("normalizeSettings: kosong → semua default", () => {
  const result = normalizeSettings(undefined)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value, DEFAULT_SETTINGS)
})

test("normalizeSettings: nilai sah diterima apa adanya", () => {
  const result = normalizeSettings({
    mode: "exam",
    timeMode: "random",
    randomMinSec: 15,
    randomMaxSec: 45,
    scoringMode: "exam",
    instantFeedback: true,
    passingScore: 80,
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.mode, "exam")
  assert.equal(result.value.timeMode, "random")
  assert.equal(result.value.randomMinSec, 15)
  assert.equal(result.value.randomMaxSec, 45)
  assert.equal(result.value.instantFeedback, true)
  assert.equal(result.value.passingScore, 80)
  // Yang tidak dikirim tetap default.
  assert.equal(result.value.totalTimeSec, 600)
})

test("normalizeSettings: nilai tidak sah ditolak", () => {
  assert.equal(normalizeSettings({ mode: "santai" }).ok, false)
  assert.equal(normalizeSettings({ timeMode: "cepat" }).ok, false)
  assert.equal(normalizeSettings({ scoringMode: "poin" }).ok, false)
  assert.equal(normalizeSettings({ defaultTimeSec: 4 }).ok, false)
  assert.equal(normalizeSettings({ defaultTimeSec: 3601 }).ok, false)
  assert.equal(normalizeSettings({ totalTimeSec: 1.5 }).ok, false)
  assert.equal(normalizeSettings({ passingScore: 101 }).ok, false)
  assert.equal(normalizeSettings({ passingScore: -1 }).ok, false)
  assert.equal(normalizeSettings("bukan objek").ok, false)
  assert.equal(normalizeSettings([]).ok, false)
})

test("normalizeSettings: randomMinSec > randomMaxSec ditolak", () => {
  const result = normalizeSettings({ randomMinSec: 50, randomMaxSec: 20 })
  assert.equal(result.ok, false)
  assert.match(result.error, /randomMinSec/)
})

test("validateRoomInput: soal bergambar + explanation + optionImages", () => {
  const result = validateRoomInput({
    title: "  Kuis Bergambar  ",
    settings: { mode: "exam", timeMode: "random", scoringMode: "exam", instantFeedback: false },
    questions: [
      {
        text: "  Berapa hasil 3/4 + 1/8?  ",
        options: ["7/8", "1/2", "4/12", "3/2"],
        correctIndex: 0,
        image: "/api/uploads/" + "a".repeat(32) + ".png",
        optionImages: [null, null, "/api/uploads/" + "b".repeat(32) + ".jpg", null],
        explanation: "  Samakan penyebut.  ",
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.value.title, "Kuis Bergambar")
  assert.equal(result.value.settings.mode, "exam")

  const question = result.value.questions[0]
  assert.equal(question.text, "Berapa hasil 3/4 + 1/8?")
  assert.equal(question.image, "/api/uploads/" + "a".repeat(32) + ".png")
  assert.deepEqual(question.optionImages, [null, null, "/api/uploads/" + "b".repeat(32) + ".jpg", null])
  assert.equal(question.explanation, "Samakan penyebut.")
  // timeMode "random" → timeSec boleh null (diundi server saat room dibuat).
  assert.equal(question.timeSec, null)
})

test("validateRoomInput: tanpa timeSec → settings.defaultTimeSec (30)", () => {
  const result = validateRoomInput({
    title: "Kuis",
    questions: [{ text: "Soal", options: ["a", "b", "c", "d"], correctIndex: 1 }],
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.questions[0].timeSec, 30)
})

test("validateRoomInput: defaultTimeSec pengguna dihormati, bukan dipaku ke 20", () => {
  const result = validateRoomInput({
    title: "Kuis 5 menit",
    settings: { defaultTimeSec: 300 },
    questions: [{ text: "Soal", options: ["a", "b", "c", "d"], correctIndex: 1 }],
  })
  assert.equal(result.ok, true)
  assert.equal(result.value.questions[0].timeSec, 300)
  // Batas 120 detik per soal ikut naik selama settings mengizinkannya.
  const long = validateRoomInput({
    title: "Kuis 5 menit",
    settings: { defaultTimeSec: 300 },
    questions: [{ text: "Soal", options: ["a", "b", "c", "d"], correctIndex: 1, timeSec: 200 }],
  })
  assert.equal(long.ok, true)
  assert.equal(long.value.questions[0].timeSec, 200)
})

test("validateRoomInput: menolak payload cacat", () => {
  const base = { title: "Kuis", questions: [{ text: "S", options: ["a", "b", "c", "d"], correctIndex: 0 }] }

  assert.equal(validateRoomInput(null).ok, false)
  assert.equal(validateRoomInput({ ...base, title: "" }).ok, false)
  assert.equal(validateRoomInput({ ...base, questions: [] }).ok, false)
  assert.equal(validateRoomInput({ ...base, questions: "bukan array" }).ok, false)
  assert.equal(
    validateRoomInput({ ...base, questions: [{ text: "S", options: ["a", "b", "c"], correctIndex: 0 }] }).ok,
    false
  )
  assert.equal(
    validateRoomInput({ ...base, questions: [{ text: "S", options: ["a", "b", "c", "d"], correctIndex: 9 }] }).ok,
    false
  )
  assert.equal(
    validateRoomInput({
      ...base,
      questions: [{ text: "S", options: ["a", "b", "c", "d"], correctIndex: 0, image: "javascript:alert(1)" }],
    }).ok,
    false
  )
  assert.equal(validateRoomInput({ ...base, settings: { mode: "santai" } }).ok, false)
  // 101 soal > MAX_QUESTIONS
  assert.equal(
    validateRoomInput({
      ...base,
      questions: Array.from({ length: 101 }, () => ({
        text: "S",
        options: ["a", "b", "c", "d"],
        correctIndex: 0,
      })),
    }).ok,
    false
  )
})

test("validateTemplateInput: payload lengkap diterima", () => {
  const result = validateTemplateInput({
    title: "  Pecahan & Akar ",
    description: " Latihan bab 3 ",
    category: "Matematika",
    subject: "Matematika",
    gradeLevel: "8A",
    tags: ["pecahan", "akar", "pecahan"],
    coverImage: "/api/uploads/" + "c".repeat(32) + ".webp",
    visibility: "public",
    settings: { mode: "exam", timeMode: "total", totalTimeSec: 900, passingScore: 75 },
    questions: [
      {
        text: "3/4 + 1/8 = ?",
        options: ["7/8", "1/2", "4/12", "3/2"],
        correctIndex: 0,
        timeSec: 30,
        image: null,
        optionImages: [null, null, null, null],
        explanation: "Samakan penyebut.",
      },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.value.title, "Pecahan & Akar")
  assert.equal(result.value.description, "Latihan bab 3")
  assert.deepEqual(result.value.tags, ["pecahan", "akar"]) // duplikat dibuang
  assert.equal(result.value.visibility, "public")
  assert.equal(result.value.settings.timeMode, "total")
  assert.equal(result.value.settings.passingScore, 75)
  assert.equal(result.value.questions.length, 1)
})

test("validateTemplateInput: menolak payload cacat", () => {
  const q = [{ text: "S", options: ["a", "b", "c", "d"], correctIndex: 0 }]

  assert.equal(validateTemplateInput(null).ok, false)
  assert.equal(validateTemplateInput({ title: "", questions: q }).ok, false)
  assert.equal(validateTemplateInput({ title: "T", questions: [] }).ok, false)
  assert.equal(validateTemplateInput({ title: "T", questions: q, visibility: "publik" }).ok, false)
  assert.equal(
    validateTemplateInput({ title: "T", questions: q, tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }).ok,
    false
  )
  assert.equal(validateTemplateInput({ title: "T", questions: q, tags: ["x".repeat(21)] }).ok, false)
  assert.equal(
    validateTemplateInput({ title: "T", questions: q, description: "x".repeat(301) }).ok,
    false
  )
})

test("validateDraft: bentuk soal baru (image/optionImages/explanation)", () => {
  const ok = validateDraft({
    title: "Kuis",
    questions: [
      {
        text: "Soal",
        options: ["a", "b", "c", "d"],
        correctIndex: 2,
        timeSec: 20,
        image: null,
        optionImages: [null, null, null, null],
        explanation: "Karena begitu.",
      },
    ],
  })
  assert.equal(ok.ok, true)
  assert.deepEqual(ok.problems, [])

  const bad = validateDraft({
    title: "",
    questions: [
      {
        text: "Soal",
        options: ["a", "", "c", "d"],
        correctIndex: 9,
        timeSec: 200,
        image: "javascript:alert(1)",
      },
    ],
  })
  assert.equal(bad.ok, false)
  assert.ok(bad.problems.length >= 4, `harus ada beberapa masalah, dapat ${bad.problems.length}`)
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. DATABASE
// ═══════════════════════════════════════════════════════════════════════════
