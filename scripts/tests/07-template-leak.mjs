// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
//
// Fokus: pastikan KUNCI JAWABAN template bawaan TIDAK PERNAH bocor ke bundel
// klien, dan bahwa sanitasi pratinjau publik tetap membuang correctIndex.
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { test, section } from "../test-harness.mjs"

const dir = path.dirname(fileURLToPath(import.meta.url))
const srcLib = path.join(dir, "..", "..", "src", "lib")

/** Buang komentar supaya uji memeriksa KODE, bukan prosa dokumentasi. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const clientSrc = stripComments(fs.readFileSync(path.join(srcLib, "templates-data.js"), "utf8"))
const serverSrc = fs.readFileSync(path.join(srcLib, "templates-data.server.js"), "utf8")

section("7. template bawaan — kunci jawaban tidak boleh bocor ke klien")

test("templates-data.js (klien) tidak memuat correctIndex / data soal lengkap", () => {
  assert.ok(!clientSrc.includes("correctIndex"), "klien tidak boleh menyebut correctIndex")
  assert.ok(!clientSrc.includes("templateToQuiz"), "klien tidak boleh memuat templateToQuiz")
  assert.ok(!clientSrc.includes("sanitizeTemplate"), "klien tidak boleh memuat sanitizeTemplate")
  // Teks soal bawaan (non-rahasia pun) tidak perlu ikut; pastikan contohnya absen.
  assert.ok(!clientSrc.includes("Hasil dari 7"), "teks soal bawaan tidak boleh ada di klien")
})

test("templates-data.js (klien) mengimpor server-guard TIDAK ada (bukan modul server)", () => {
  assert.ok(!clientSrc.includes("server-guard"), "modul klien bukan modul server")
})

test("templates-data.server.js memakai server-guard", () => {
  assert.ok(serverSrc.includes("server-guard"), "modul data lengkap wajib dijaga server-guard")
  assert.ok(serverSrc.includes("correctIndex"), "data lengkap memang memuat correctIndex")
})

test("klien: TEMPLATE_INDEX tidak memuat questions / correctIndex", async () => {
  const client = await import(path.join(srcLib, "templates-data.js"))
  assert.ok(Array.isArray(client.TEMPLATE_INDEX) && client.TEMPLATE_INDEX.length > 0)
  for (const row of client.TEMPLATE_INDEX) {
    assert.ok(!("questions" in row), `${row.id}: ringkasan tidak boleh memuat questions`)
    assert.ok(!("correctIndex" in row), `${row.id}: ringkasan tidak boleh memuat correctIndex`)
    assert.equal(typeof row.questionCount, "number")
    assert.equal(typeof row.estimatedTimeMin, "number")
    assert.ok(row.estimatedTimeMin >= 1 && Number.isFinite(row.estimatedTimeMin))
    assert.equal(typeof row.rating, "number")
    assert.equal(typeof row.author, "string")
  }
})

test("server: sanitizeTemplate membuang correctIndex & mempertahankan teks+opsi", async () => {
  const server = await import(path.join(srcLib, "templates-data.server.js"))
  const raw = server.getTemplateById("tpl-perkalian-cepat")
  assert.ok(raw, "template contoh harus ada")
  assert.ok(raw.questions[0].correctIndex !== undefined, "sumber memang punya kunci")

  const safe = server.sanitizeTemplate(raw)
  assert.ok(!("correctIndex" in safe))
  for (const question of safe.questions) {
    assert.deepEqual(Object.keys(question).sort(), ["options", "text"])
    assert.equal(question.correctIndex, undefined)
  }
  assert.equal(safe.questionCount, raw.questions.length)
})

test("server: templateToQuiz mempertahankan kunci (dipakai API builtin)", async () => {
  const server = await import(path.join(srcLib, "templates-data.server.js"))
  const raw = server.getTemplateById("tpl-tata-surya")
  const quiz = server.templateToQuiz(raw)
  assert.equal(quiz.sourceTemplateId, raw.id)
  assert.equal(quiz.questions.length, raw.questions.length)
  assert.ok(quiz.questions.every((question) => typeof question.correctIndex === "number"))
  // structuredClone → salinan, bukan referensi yang sama.
  assert.notEqual(quiz.questions[0], raw.questions[0])
})

test("db: seed akun demo digerakkan NODE_ENV / QUIZ_SEED_DEMO", async () => {
  const source = fs.readFileSync(path.join(srcLib, "db.js"), "utf8")
  // Fungsi gerbang harus ada & dipanggil di dalam seedDemoUsers.
  assert.match(source, /function shouldSeedDemoUsers\(\)/)
  assert.match(source, /if \(!shouldSeedDemoUsers\(\)\) return/)
  assert.match(source, /NODE_ENV !== "production"/)
})
