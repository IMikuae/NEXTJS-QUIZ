// ═══════════════════════════════════════════════════════════════════════════
// SELF-TEST — runner uji lapisan server TANPA framework
// ═══════════════════════════════════════════════════════════════════════════
// Jalankan:  node scripts/self-test.mjs
//
// Uji dipecah per domain di scripts/tests/ (masing-masing mengimpor harness
// dari scripts/test-harness.mjs dan fixture dari scripts/test-fixtures.mjs):
//   01-scoring.mjs    — gradeFor, scoreForMode, summarizePlayer, rankSummaries
//   02-uploads.mjs    — sniffImageType, dimensi, decodeDataUrl, UPLOAD_ID_RE
//   03-validate.mjs   — normalizeSettings, validateRoomInput/TemplateInput/Draft
//   04-db.mjs         — user/template/upload/arsip ditulis lalu dibaca kembali
//   05-quiz-store.mjs — mesin room + anti-bocor `correctIndex`
//   06-overhaul.mjs   — keamanan & fitur overhaul (auth publik, rank, privasi)
//   07-template-leak.mjs — kunci jawaban template bawaan tidak bocor ke klien
//   08-security-hardening.mjs — rate limit host, compare waktu-konstan, CSP nonce
//
// Berkas DB memakai QUIZ_DB_PATH (folder sementara) supaya data/quiz.db milik
// aplikasi TIDAK tersentuh.
//
// Tanpa dependency: hanya node:assert, node:fs, node:os, node:path.
// ═══════════════════════════════════════════════════════════════════════════

import { state, cleanup } from "./test-harness.mjs"

// Impor modul uji secara berurutan. Setiap modul mendaftarkan test-nya sendiri
// lewat `test()` dari harness (dijalankan langsung saat impor).
const suites = [
  "./tests/01-scoring.mjs",
  "./tests/02-uploads.mjs",
  "./tests/03-validate.mjs",
  "./tests/04-db.mjs",
  "./tests/05-quiz-store.mjs",
  "./tests/06-overhaul.mjs",
  "./tests/07-template-leak.mjs",
  "./tests/08-security-hardening.mjs",
]

for (const suite of suites) {
  await import(suite)
}

// ═══════════════════════════════════════════════════════════════════════════
// Ringkasan
// ═══════════════════════════════════════════════════════════════════════════
console.log("")
console.log("═".repeat(66))
console.log(`LULUS ${state.passed} · GAGAL ${state.failed}`)
console.log("═".repeat(66))

cleanup()

process.exit(state.failed === 0 ? 0 : 1)
