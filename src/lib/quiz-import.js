"use client"

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ IMPORT — parser teks → soal (dipakai ImportWizard & "Tambah massal")
// ═══════════════════════════════════════════════════════════════════════════
// Dua bentuk masukan, keduanya boleh bercampur dalam satu tempelan:
//
// 1) SATU BARIS (format lama, tetap didukung)
//    Pertanyaan | Opsi A | Opsi B | Opsi C | Opsi D | K | detik
//    • pemisah `|`; bila tidak ada `|` tapi ada ≥6 koma → diparse sebagai CSV
//    • kolom opsional: detik, gambar soal, gambar opsi, penjelasan
//
// 2) BLOK (satu soal per blok, dipisah baris kosong)
//    Ibu kota Indonesia? [img:/api/uploads/…]
//    A. Jakarta
//    B. Bandung [img:/api/uploads/…]
//    C. Medan
//    D. Bali
//    Jawaban: A
//    Waktu: 20
//    // Karena Jakarta adalah ibu kota negara.
//
//    Penanda yang dikenali di dalam blok:
//      [img:URL]         gambar soal (di baris mana pun di luar baris opsi)
//      A. / A) / A:      opsi A–D (gambar opsi boleh ditempel di barisnya)
//      Jawaban: / K:     huruf jawaban benar
//      Waktu: / Detik:   durasi soal
//      // teks           penjelasan (juga "Penjelasan: teks")
//
// Hasil: { questions, rowErrors, stats } — `rowErrors` memuat nomor baris +
// potongan teks supaya pengguna bisa memperbaiki, bukan sekadar "gagal".
// ═══════════════════════════════════════════════════════════════════════════

import {
  DEFAULT_TIME_SEC,
  MAX_OPTION_LEN,
  MAX_QUESTION_TEXT_LEN,
  MAX_TIME_SEC,
  MIN_TIME_SEC,
  OPTION_COUNT,
} from "@/lib/quiz-validate"

const LETTER_TO_INDEX = { A: 0, B: 1, C: 2, D: 3 }
const OPTION_LINE = /^([A-Da-d])\s*[.):\-]\s*(.+)$/
const ANSWER_LINE = /^(?:jawaban|kunci|k)\s*[:=]\s*(.+)$/i
const TIME_LINE = /^(?:waktu|detik|durasi|time)\s*[:=]\s*(\d+)\s*(?:s|detik)?$/i
const EXPLANATION_LINE = /^(?:penjelasan|pembahasan|explanation)\s*[:=]\s*(.+)$/i

/** Ambil semua `[img:URL]` dari satu string; kembalikan sisa teksnya. */
function extractImages(input) {
  const images = []
  const text = String(input ?? "").replace(/\[img:\s*([^\]]+)\]/gi, (_, url) => {
    images.push(url.trim())
    return " "
  })
  return { text: text.replace(/\s+/g, " ").trim(), images }
}

/** Pecah satu baris CSV menghormati tanda kutip ganda. */
function splitCsvLine(line) {
  const fields = []
  let current = ""
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        current += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
      continue
    }
    if (char === "," || char === ";") {
      fields.push(current)
      current = ""
      continue
    }
    current += char
  }
  fields.push(current)

  return fields.map((field) => field.trim())
}

/** Longgarkan panjang teks mengikuti batas yang dipakai server. */
function clampText(text, max) {
  const value = String(text ?? "").trim()
  return value.length > max ? value.slice(0, max) : value
}

function blankQuestion() {
  return {
    text: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    timeSec: DEFAULT_TIME_SEC,
    image: null,
    optionImages: [null, null, null, null],
    explanation: null,
  }
}

// ─── Mode satu baris ───────────────────────────────────────────────────────

function parseSingleLine(line, lineNo, rowErrors) {
  const parts = line.includes("|")
    ? line.split("|").map((part) => part.trim())
    : splitCsvLine(line)

  // Buang kolom header yang lazim ("Soal, A, B, …").
  if (/^(no|soal|pertanyaan|question)$/i.test(parts[0] ?? "") && parts.length >= OPTION_COUNT + 2) {
    return null
  }

  if (parts.length < OPTION_COUNT + 2) {
    rowErrors.push({
      line: lineNo,
      text: line.slice(0, 80),
      error: "Kurang kolom. Format: Pertanyaan | A | B | C | D | K | detik (opsional).",
    })
    return null
  }

  // Kumpulkan gambar/penjelasan dari kolom mana pun lebih dulu.
  const cleaned = parts.map((part) => extractImages(part))
  const question = blankQuestion()
  question.text = clampText(cleaned[0].text, MAX_QUESTION_TEXT_LEN)
  question.image = cleaned[0].images[0] ?? null

  const options = []
  for (let i = 0; i < OPTION_COUNT; i += 1) {
    const cell = cleaned[1 + i]
    options.push(clampText(cell.text, MAX_OPTION_LEN))
    question.optionImages[i] = cell.images[0] ?? null
  }
  question.options = options

  // Sisa kolom: jawaban, detik, penjelasan (urutan apa pun).
  let answerRaw = null
  for (const cell of cleaned.slice(1 + OPTION_COUNT)) {
    const value = cell.text.trim()
    if (value.length === 0) continue

    if (/^\/\//.test(value) || /^(penjelasan|pembahasan)\s*[:=]/i.test(value)) {
      question.explanation = clampText(value.replace(/^\/\/\s*/, "").replace(/^(penjelasan|pembahasan)\s*[:=]\s*/i, ""), 500)
      continue
    }
    if (/^\d+$/.test(value)) {
      const seconds = Number.parseInt(value, 10)
      if (seconds >= MIN_TIME_SEC && seconds <= MAX_TIME_SEC) {
        question.timeSec = seconds
      } else {
        rowErrors.push({
          line: lineNo,
          text: question.text.slice(0, 80) || line.slice(0, 80),
          error: `Durasi "${value}" di luar ${MIN_TIME_SEC}–${MAX_TIME_SEC} detik — dipakai ${DEFAULT_TIME_SEC}s.`,
        })
      }
      continue
    }
    if (answerRaw === null) answerRaw = value
  }
  if (answerRaw !== null) {
    const correctIndex = LETTER_TO_INDEX[answerRaw.toUpperCase()]
    if (correctIndex === undefined) {
      rowErrors.push({
        line: lineNo,
        text: question.text.slice(0, 80) || line.slice(0, 80),
        error: `Kolom jawaban "${answerRaw}" harus A–D.`,
      })
      return null
    }
    question.correctIndex = correctIndex
  }

  const problem = checkQuestion(question)
  if (problem) {
    rowErrors.push({ line: lineNo, text: question.text.slice(0, 80) || line.slice(0, 80), error: problem })
    return null
  }

  return question
}

// ─── Mode blok ─────────────────────────────────────────────────────────────

function parseBlock(lines, startLineNo, rowErrors) {
  const question = blankQuestion()
  const bodyLines = []
  const optionLines = new Map()
  let answerRaw = null

  lines.forEach((rawLine, offset) => {
    const lineNo = startLineNo + offset
    const line = rawLine.trim()
    if (line.length === 0) return

    if (/^\/\//.test(line)) {
      question.explanation = clampText(line.replace(/^\/\/\s*/, ""), 500)
      return
    }

    const explanationMatch = EXPLANATION_LINE.exec(line)
    if (explanationMatch) {
      question.explanation = clampText(explanationMatch[1], 500)
      return
    }

    const timeMatch = TIME_LINE.exec(line)
    if (timeMatch) {
      const seconds = Number.parseInt(timeMatch[1], 10)
      if (seconds >= MIN_TIME_SEC && seconds <= MAX_TIME_SEC) {
        question.timeSec = seconds
      } else {
        rowErrors.push({
          line: lineNo,
          text: line.slice(0, 80),
          error: `Durasi "${timeMatch[1]}" di luar ${MIN_TIME_SEC}–${MAX_TIME_SEC} detik — dipakai ${DEFAULT_TIME_SEC}s.`,
        })
      }
      return
    }

    const answerMatch = ANSWER_LINE.exec(line)
    if (answerMatch) {
      answerRaw = answerMatch[1].trim()
      return
    }

    const optionMatch = OPTION_LINE.exec(line)
    if (optionMatch) {
      const letter = optionMatch[1].toUpperCase()
      const { text, images } = extractImages(optionMatch[2])
      optionLines.set(LETTER_TO_INDEX[letter], { text, images })
      return
    }

    bodyLines.push(line)
  })

  const body = extractImages(bodyLines.join(" "))
  question.text = clampText(body.text, MAX_QUESTION_TEXT_LEN)
  question.image = body.images[0] ?? null

  for (let i = 0; i < OPTION_COUNT; i += 1) {
    const option = optionLines.get(i)
    if (!option) continue
    question.options[i] = clampText(option.text, MAX_OPTION_LEN)
    question.optionImages[i] = option.images[0] ?? null
  }

  if (answerRaw !== null) {
    const correctIndex = LETTER_TO_INDEX[answerRaw.toUpperCase()]
    if (correctIndex === undefined) {
      rowErrors.push({
        line: startLineNo,
        text: question.text.slice(0, 80),
        error: `Jawaban "${answerRaw}" harus A–D.`,
      })
      return null
    }
    question.correctIndex = correctIndex
  }

  const problem = checkQuestion(question)
  if (problem) {
    rowErrors.push({ line: startLineNo, text: question.text.slice(0, 80) || lines[0].slice(0, 80), error: problem })
    return null
  }

  return question
}

/** Validasi bentuk soal hasil parse (cermin aturan server). */
function checkQuestion(question) {
  if (question.text.length === 0) return "Teks soal kosong."
  const emptyOption = question.options.findIndex((option) => option.trim().length === 0)
  if (emptyOption !== -1) {
    return `Opsi ${String.fromCharCode(65 + emptyOption)} masih kosong.`
  }
  return null
}

/** Apakah blok ini ditulis dalam bentuk blok (bukan satu baris)? */
function looksLikeBlock(lines) {
  return lines.some((line) => {
    const trimmed = line.trim()
    if (trimmed.length === 0) return false
    return (
      OPTION_LINE.test(trimmed) ||
      ANSWER_LINE.test(trimmed) ||
      /^\[img:/i.test(trimmed) ||
      /^\/\//.test(trimmed)
    )
  })
}

// ─── Parser utama ──────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {{ questions: Array, rowErrors: Array<{line:number,text:string,error:string}>, stats: object }}
 */
export function parseImportText(text) {
  const questions = []
  const rowErrors = []
  const source = String(text ?? "")
  const lines = source.split(/\r?\n/)

  // Pisah menjadi blok berdasarkan baris kosong, sambil melacak nomor baris.
  const blocks = []
  let current = null

  lines.forEach((line, index) => {
    if (line.trim().length === 0) {
      current = null
      return
    }
    if (!current) {
      current = { startLine: index + 1, lines: [] }
      blocks.push(current)
    }
    current.lines.push(line)
  })

  for (const block of blocks) {
    if (block.lines.length === 1 || !looksLikeBlock(block.lines)) {
      block.lines.forEach((line, offset) => {
        if (line.trim().length === 0) return
        const question = parseSingleLine(line.trim(), block.startLine + offset, rowErrors)
        if (question) questions.push(question)
      })
      continue
    }

    const question = parseBlock(block.lines, block.startLine, rowErrors)
    if (question) questions.push(question)
  }

  const withImage = questions.filter((question) => question.image).length
  const withExplanation = questions.filter((question) => question.explanation).length

  return {
    questions,
    rowErrors,
    stats: {
      total: questions.length,
      withImage,
      withExplanation,
      withCustomTime: questions.filter((question) => question.timeSec !== DEFAULT_TIME_SEC).length,
    },
  }
}

/** Contoh teks untuk tombol "Isi contoh" di wizard impor. */
export const IMPORT_EXAMPLE = [
  "Ibu kota Indonesia? | Jakarta | Bandung | Medan | Bali | A | 20",
  "Hasil dari 3/4 + 1/8 adalah … | 7/8 | 1/2 | 4/12 | 3/2 | A | 30 | // Samakan penyebut: 6/8 + 1/8.",
  "Planet terdekat dari Matahari? | Venus | Bumi | Merkurius | Mars | C",
  "",
  "Hasil dari sqrt(144) + 2^3?",
  "A. 20",
  "B. 24",
  "C. 26",
  "D. 32",
  "Jawaban: A",
  "Waktu: 25",
  "// sqrt(144) = 12 dan 2^3 = 8, jadi 12 + 8 = 20.",
].join("\n")

/** Contoh CSV (tempel langsung dari spreadsheet). */
export const IMPORT_CSV_EXAMPLE = [
  "Pertanyaan,Opsi A,Opsi B,Opsi C,Opsi D,Jawaban,Detik",
  '"Berapakah hasil 12 x 8?",86,96,106,116,B,15',
  '"Planet merah adalah …",Mars,Jupiter,Saturnus,Neptunus,A,15',
].join("\n")
