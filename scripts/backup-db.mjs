// ═══════════════════════════════════════════════════════════════════════════
// BACKUP DB — salinan konsisten data/quiz.db memakai API backup node:sqlite
// ═══════════════════════════════════════════════════════════════════════════
// Jalankan:  node scripts/backup-db.mjs [tujuan]
//
// Default tujuan: data/backups/quiz-<timestamp>.db
//
// node:sqlite menyediakan backup() yang membuat snapshot konsisten meski ada
// penulisan berjalan (aman terhadap WAL). Ini cara yang benar — menyalin file
// mentah saat WAL aktif bisa menghasilkan salinan setengah jadi.
//
// Tanpa dependency: hanya node:sqlite, node:fs, node:path.
// ═══════════════════════════════════════════════════════════════════════════

import { DatabaseSync, backup } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"

const source = process.env.QUIZ_DB_PATH || path.join(process.cwd(), "data", "quiz.db")

if (!fs.existsSync(source)) {
  console.error(`Berkas DB tidak ditemukan: ${source}`)
  process.exit(1)
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const defaultDir = path.join(process.cwd(), "data", "backups")
const target = process.argv[2] || path.join(defaultDir, `quiz-${stamp}.db`)

fs.mkdirSync(path.dirname(target), { recursive: true })

// Salinan lama dihapus dulu supaya backup() tidak menimpa (API menolak tujuan
// yang sudah ada pada beberapa versi Node).
try {
  if (fs.existsSync(target)) fs.rmSync(target)
} catch {
  // abaikan
}

const db = new DatabaseSync(source, { readOnly: true })
try {
  // backup() mengembalikan Promise; tunggu sampai selesai.
  await backup(db, target)
  const { size } = fs.statSync(target)
  console.log(`Backup selesai: ${target} (${Math.round(size / 1024)} KB)`)
} catch (error) {
  console.error(`Backup gagal: ${error?.message || error}`)
  process.exit(1)
} finally {
  db.close()
}
