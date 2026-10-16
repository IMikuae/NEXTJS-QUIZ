// ═══════════════════════════════════════════════════════════════════════════
// TEST HARNESS — setup DB sementara + assert ringan tanpa framework
// ═══════════════════════════════════════════════════════════════════════════
// Dipakai bersama oleh semua berkas uji di scripts/tests/. WAJIB diimpor
// SEBELUM modul apa pun yang menyentuh db.js, karena ia menyetel QUIZ_DB_PATH
// ke folder sementara supaya data/quiz.db milik aplikasi tidak tersentuh.
// ═══════════════════════════════════════════════════════════════════════════

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

// ─── DB sementara SEBELUM modul lain diimpor ───────────────────────────────
export const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yq-selftest-"))
process.env.QUIZ_DB_PATH = path.join(tempDir, "quiz.db")
// auth.js membaca NODE_ENV untuk opsi `secure` cookie — paksa non-produksi.
process.env.NODE_ENV = "test"

// ─── Penghitung global ─────────────────────────────────────────────────────
export const state = { passed: 0, failed: 0 }

/** Jalankan satu kasus uji; catat lulus/gagal tanpa menghentikan suite. */
export function test(name, fn) {
  try {
    fn()
    state.passed += 1
    console.log(`  ok   ${name}`)
  } catch (error) {
    state.failed += 1
    console.log(`  GAGAL ${name}`)
    console.log(`       ${String(error.message).split("\n").join("\n       ")}`)
  }
}

/** Judul grup uji. */
export function section(title) {
  console.log(`\n${title}`)
}

/** Bersihkan folder DB sementara. */
export function cleanup() {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true })
  } catch {
    // abaikan
  }
}
