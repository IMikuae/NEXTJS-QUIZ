// ═══════════════════════════════════════════════════════════════════════════
// CHECK — `node --check` untuk SETIAP berkas .js/.jsx di src/
// ═══════════════════════════════════════════════════════════════════════════
// Dipakai sebagai pengganti build yang cepat: menjalankan `next build` hanya
// untuk memeriksa sintaks itu lambat dan menulis ke .next (bisa bentrok dengan
// proses dev yang sedang berjalan). Skrip ini murni sintaks — tidak
// menyelesaikan impor, tidak menjalankan kode.
//
// Berkas .js dan .mjs diperiksa dengan `node --check`.
//
// Berkas .jsx TIDAK BISA diperiksa `node --check`: Node tidak mengenal sintaks
// JSX sama sekali (ia berhenti di "<div"). Untuk berkas .jsx skrip ini memakai
// @babel/parser yang SUDAH ADA di dalam node_modules/next/dist/compiled/babel
// — tidak ada unduhan, tidak ada dependency baru di package.json, dan
// pustaka itu memang yang dipakai Next untuk mengurai .jsx. Kalau parser itu
// tidak ditemukan, berkas .jsx DILAPORKAN sebagai "dilewati" (bukan "ok"),
// supaya kekurangan itu terlihat, bukan tersembunyi.
//
// Tanpa dependency apa pun: hanya node:fs, node:path, node:child_process, dan
// impor dinamis opsional ke parser bawaan Next.

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"

const ROOT = path.resolve(process.cwd(), "src")

/** Semua berkas .js/.jsx/.mjs di dalam folder, rekursif. */
function collect(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      found.push(...collect(full))
    } else if (entry.isFile() && /\.(js|jsx|mjs)$/.test(entry.name)) {
      found.push(full)
    }
  }
  return found
}

/** `node --check` pada satu berkas; kembalikan pesan error atau null. */
function checkWithNode(file) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" })
    return null
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : String(error.message ?? error)
    return stderr.trim()
  }
}

/** @babel/parser bawaan Next, atau null bila tidak tersedia. */
let babelParser
async function loadJsxParser() {
  if (babelParser !== undefined) return babelParser
  const candidates = [
    "next/dist/compiled/babel/parser.js",
    "next/dist/compiled/babel/parser",
  ]
  for (const candidate of candidates) {
    try {
      // Impor dinamis: modul CJS bawaan Next tidak punya ekspor ESM bernama.
      const mod = await import(candidate)
      const parser = mod?.parse ? mod : mod?.default
      if (parser && typeof parser.parse === "function") {
        babelParser = parser
        return babelParser
      }
    } catch {
      // coba kandidat berikutnya
    }
  }
  babelParser = null
  return null
}

/** Parse berkas JSX dengan @babel/parser; kembalikan pesan error atau null. */
function checkWithBabel(parser, file) {
  const source = fs.readFileSync(file, "utf8")
  try {
    parser.parse(source, {
      sourceType: "module",
      plugins: ["jsx", "classProperties", "objectRestSpread", "optionalChaining"],
      errorRecovery: false,
    })
    return null
  } catch (error) {
    const location = error.loc ? ` (baris ${error.loc.line}, kolom ${error.loc.column})` : ""
    return `${error.message}${location}`
  }
}

const files = collect(ROOT).sort()
if (files.length === 0) {
  console.error("Tidak ada berkas .js/.jsx ditemukan di src/.")
  process.exit(1)
}

const jsxParser = await loadJsxParser()
const failures = []
let skipped = 0

for (const file of files) {
  const relative = path.relative(process.cwd(), file)

  if (file.endsWith(".jsx")) {
    if (!jsxParser) {
      skipped += 1
      console.log(`LEWAT  ${relative}  (parser JSX tidak tersedia)`)
      continue
    }
    const problem = checkWithBabel(jsxParser, file)
    if (problem) {
      failures.push({ file: relative, problem })
      console.log(`GAGAL  ${relative}`)
    } else {
      console.log(`ok     ${relative}  (jsx)`)
    }
    continue
  }

  const problem = checkWithNode(file)
  if (problem) {
    failures.push({ file: relative, problem })
    console.log(`GAGAL  ${relative}`)
  } else {
    console.log(`ok     ${relative}`)
  }
}

console.log("")
if (failures.length > 0) {
  console.error(`${failures.length} dari ${files.length} berkas GAGAL di-parse:\n`)
  for (const failure of failures) {
    console.error(`── ${failure.file}\n${failure.problem}\n`)
  }
  process.exit(1)
}

const note = skipped > 0 ? ` (${skipped} berkas .jsx dilewati)` : ""
console.log(`Semua ${files.length} berkas lolos pemeriksaan sintaks${note}.`)
