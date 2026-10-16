// ═══════════════════════════════════════════════════════════════════════════
// QUIZ VALIDATE — konstanta & validasi payload quiz. Dipakai dua sisi:
//   • server (POST /api/rooms, /api/templates) via re-export dari quiz-store.js
//   • klien (editor & import wizard) supaya aturan SAMA persis
// Modul murni — TANPA import apa pun, tanpa akses store, tanpa side effect.
// Karena klien mengimpornya juga, file ini tidak boleh menyentuh node:fs,
// process.env, atau apa pun yang hanya ada di server.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Batas soal ────────────────────────────────────────────────────────────
export const DEFAULT_TIME_SEC = 20
export const MIN_TIME_SEC = 5
export const MAX_TIME_SEC = 120
export const MIN_QUESTIONS = 1
export const MAX_QUESTIONS = 100
export const MAX_TITLE_LEN = 80
export const MAX_QUESTION_TEXT_LEN = 500
export const MAX_OPTION_LEN = 200
export const MAX_EXPLANATION_LEN = 500
export const MAX_IMAGE_URL_LEN = 200
export const MAX_NAME_LEN = 20
export const OPTION_COUNT = 4

// ─── Batas template ────────────────────────────────────────────────────────
export const MAX_DESCRIPTION_LEN = 300
export const MAX_TAGS = 8
export const MAX_TAG_LEN = 20
export const MAX_SUBJECT_LEN = 60
export const MAX_GRADE_LEVEL_LEN = 40
export const MAX_CATEGORY_LEN = 40

// ─── Kosakata mode & pengaturan (CONTRACT §1) ──────────────────────────────
export const TIME_MODES = ["per-question", "random", "total", "none"]
export const QUIZ_MODES = ["live", "exam"]
export const SCORING_MODES = ["competitive", "exam"]
export const VISIBILITIES = ["private", "public"]

/** Batas untuk SEMUA durasi di dalam settings (detik). */
export const MIN_SETTINGS_SEC = 5
export const MAX_SETTINGS_SEC = 3600

/** Nilai awal settings. Dibekukan supaya tidak ada pemanggil yang mengubahnya. */
export const DEFAULT_SETTINGS = Object.freeze({
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

// ═══════════════════════════════════════════════════════════════════════════
// HELPER KECIL
// ═══════════════════════════════════════════════════════════════════════════

/** Boolean dari nilai apa pun; string "true"/"1" dari form juga diterima. */
function toBool(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value === "boolean") return value
  if (value === "true" || value === "1" || value === 1) return true
  if (value === "false" || value === "0" || value === 0) return false
  return fallback
}

/** Bilangan bulat dalam rentang, atau null bila tidak sah. */
function intInRange(value, min, max) {
  if (typeof value !== "number" || !Number.isInteger(value)) return null
  if (value < min || value > max) return null
  return value
}

/**
 * Normalisasi URL gambar: null bila kosong, string bersih bila sah,
 * `undefined` bila tidak sah (pemanggil yang memutuskan pesan errornya).
 *
 * Yang diterima: path internal "/api/uploads/<32hex>.<ext>" ATAU URL http(s).
 * Data URL SENGAJA ditolak — gambar harus lewat POST /api/uploads supaya
 * payload room tetap kecil dan ukurannya bisa ditegakkan di satu tempat.
 */
export function normalizeImageUrl(value) {
  if (value === undefined || value === null) return null
  if (typeof value !== "string") return undefined
  const clean = value.trim()
  if (clean === "") return null
  if (clean.length > MAX_IMAGE_URL_LEN) return undefined
  if (/\s/.test(clean)) return undefined
  if (clean.startsWith("/")) return clean
  if (/^https?:\/\//i.test(clean)) return clean
  return undefined
}

/** Tag: array string bersih, maksimum MAX_TAGS. `undefined` bila tidak sah. */
export function normalizeTags(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return undefined
  if (value.length > MAX_TAGS) return undefined

  const tags = []
  for (const raw of value) {
    if (typeof raw !== "string") return undefined
    const clean = raw.trim()
    if (clean === "") continue
    if (clean.length > MAX_TAG_LEN) return undefined
    if (!tags.includes(clean)) tags.push(clean)
  }
  return tags
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lengkapi & validasi objek settings.
 *
 * Semua field opsional: yang tidak dikirim diisi DEFAULT_SETTINGS. Yang
 * dikirim tapi tidak sah → error (bukan diam-diam diganti default), supaya
 * kesalahan konfigurasi tidak berubah jadi perilaku kuis yang membingungkan.
 *
 * @param {any} raw
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function normalizeSettings(raw) {
  let input = raw
  if (input === undefined || input === null) input = {}
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: 'Field "settings" harus berupa objek.' }
  }

  const settings = { ...DEFAULT_SETTINGS }

  // ── Mode & waktu ──
  if (input.mode !== undefined) {
    if (!QUIZ_MODES.includes(input.mode)) {
      return { ok: false, error: 'Field "mode" harus "live" atau "exam".' }
    }
    settings.mode = input.mode
  }

  if (input.timeMode !== undefined) {
    if (!TIME_MODES.includes(input.timeMode)) {
      return {
        ok: false,
        error: 'Field "timeMode" harus salah satu dari per-question, random, total, none.',
      }
    }
    settings.timeMode = input.timeMode
  }

  if (input.scoringMode !== undefined) {
    if (!SCORING_MODES.includes(input.scoringMode)) {
      return { ok: false, error: 'Field "scoringMode" harus "competitive" atau "exam".' }
    }
    settings.scoringMode = input.scoringMode
  }

  // ── Durasi (5–3600 detik) ──
  const durationFields = ["defaultTimeSec", "randomMinSec", "randomMaxSec", "totalTimeSec"]
  for (const field of durationFields) {
    if (input[field] === undefined) continue
    const value = intInRange(input[field], MIN_SETTINGS_SEC, MAX_SETTINGS_SEC)
    if (value === null) {
      return {
        ok: false,
        error: `Field "${field}" harus bilangan bulat antara ${MIN_SETTINGS_SEC}–${MAX_SETTINGS_SEC} detik.`,
      }
    }
    settings[field] = value
  }

  if (settings.randomMinSec > settings.randomMaxSec) {
    return { ok: false, error: 'Field "randomMinSec" tidak boleh lebih besar dari "randomMaxSec".' }
  }

  // ── passingScore (0–100) ──
  if (input.passingScore !== undefined) {
    const value = intInRange(input.passingScore, 0, 100)
    if (value === null) {
      return { ok: false, error: 'Field "passingScore" harus bilangan bulat antara 0–100.' }
    }
    settings.passingScore = value
  }

  // ── Boolean ──
  const boolFields = [
    "instantFeedback",
    "showExplanation",
    "shuffleQuestions",
    "shuffleOptions",
    "allowBack",
  ]
  for (const field of boolFields) {
    settings[field] = toBool(input[field], settings[field])
  }

  return { ok: true, value: settings }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validasi satu soal. Dipakai oleh validateRoomInput & validateTemplateInput
 * supaya bentuk soal yang tersimpan di room dan di template identik.
 *
 * `timeSec` bersifat opsional (CONTRACT §1 & §6). Perilakunya:
 *   • `timeMode: "per-question"` → diisi `settings.defaultTimeSec` bila tidak
 *     dikirim. Tanpa ini, soal yang tidak menyebut durasi akan berakhir
 *     seketika (timeSec null → durasi 0), dan pengguna yang menyetel
 *     "Durasi default" di panel pengaturan akan mengira setelannya diabaikan.
 *   • `timeMode` lain (`random`/`total`/`none`) → dibiarkan `null`. Justru itu
 *     yang benar: mode random mengundi durasinya di server saat room dibuat,
 *     dan mode total/none memang tidak punya batas per soal.
 *
 * @param {any} raw
 * @param {string} label — mis. "Soal 3"
 * @param {{ timeSecOptional: boolean, timeSecMax: number, defaultTimeSec: number }} options
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
function normalizeQuestion(raw, label, { timeSecOptional, timeSecMax, defaultTimeSec }) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `${label}: bentuk soal tidak valid.` }
  }

  if (typeof raw.text !== "string") {
    return { ok: false, error: `${label}: teks soal wajib diisi.` }
  }
  const text = raw.text.trim()
  if (text.length === 0) return { ok: false, error: `${label}: teks soal kosong.` }
  if (text.length > MAX_QUESTION_TEXT_LEN) {
    return { ok: false, error: `${label}: teks soal maksimal ${MAX_QUESTION_TEXT_LEN} karakter.` }
  }

  if (!Array.isArray(raw.options)) {
    return { ok: false, error: `${label}: opsi jawaban wajib berupa array.` }
  }
  if (raw.options.length !== OPTION_COUNT) {
    return {
      ok: false,
      error: `${label}: harus ada tepat ${OPTION_COUNT} opsi jawaban (dikirim ${raw.options.length}).`,
    }
  }

  const options = []
  for (let j = 0; j < OPTION_COUNT; j += 1) {
    const option = raw.options[j]
    if (typeof option !== "string") {
      return { ok: false, error: `${label}: opsi ke-${j + 1} wajib berupa teks.` }
    }
    const clean = option.trim()
    if (clean.length === 0) return { ok: false, error: `${label}: opsi ke-${j + 1} kosong.` }
    if (clean.length > MAX_OPTION_LEN) {
      return { ok: false, error: `${label}: opsi ke-${j + 1} maksimal ${MAX_OPTION_LEN} karakter.` }
    }
    options.push(clean)
  }

  const correctIndex = raw.correctIndex
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= OPTION_COUNT) {
    return {
      ok: false,
      error: `${label}: jawaban benar harus salah satu dari opsi 1–${OPTION_COUNT}.`,
    }
  }

  // ── Durasi: opsional; `null` = "tidak ditentukan soal ini" ──
  let timeSec = null
  if (raw.timeSec !== undefined && raw.timeSec !== null) {
    if (!Number.isInteger(raw.timeSec)) {
      return { ok: false, error: `${label}: durasi harus berupa bilangan bulat (detik).` }
    }
    if (raw.timeSec < MIN_TIME_SEC || raw.timeSec > timeSecMax) {
      return {
        ok: false,
        error: `${label}: durasi harus antara ${MIN_TIME_SEC}–${timeSecMax} detik.`,
      }
    }
    timeSec = raw.timeSec
  } else if (!timeSecOptional) {
    timeSec = defaultTimeSec
  }

  // ── Gambar soal ──
  const image = normalizeImageUrl(raw.image)
  if (image === undefined) {
    return {
      ok: false,
      error: `${label}: URL gambar soal tidak valid (maksimal ${MAX_IMAGE_URL_LEN} karakter).`,
    }
  }

  // ── Gambar per opsi: boleh kosong; bila diisi harus tepat 4 slot ──
  let optionImages = [null, null, null, null]
  if (raw.optionImages !== undefined && raw.optionImages !== null) {
    if (!Array.isArray(raw.optionImages)) {
      return { ok: false, error: `${label}: gambar opsi wajib berupa array.` }
    }
    if (raw.optionImages.length > OPTION_COUNT) {
      return { ok: false, error: `${label}: gambar opsi maksimal ${OPTION_COUNT} slot.` }
    }
    for (let j = 0; j < OPTION_COUNT; j += 1) {
      const resolved = normalizeImageUrl(raw.optionImages[j])
      if (resolved === undefined) {
        return { ok: false, error: `${label}: URL gambar opsi ke-${j + 1} tidak valid.` }
      }
      optionImages[j] = resolved
    }
  }

  // ── Penjelasan ──
  let explanation = null
  if (raw.explanation !== undefined && raw.explanation !== null) {
    if (typeof raw.explanation !== "string") {
      return { ok: false, error: `${label}: penjelasan wajib berupa teks.` }
    }
    const clean = raw.explanation.trim()
    if (clean.length > MAX_EXPLANATION_LEN) {
      return {
        ok: false,
        error: `${label}: penjelasan maksimal ${MAX_EXPLANATION_LEN} karakter.`,
      }
    }
    explanation = clean === "" ? null : clean
  }

  return { ok: true, value: { text, options, correctIndex, timeSec, image, optionImages, explanation } }
}

/**
 * Validasi body POST /api/rooms.
 *
 * @param {any} payload
 * @returns {{ ok: true, value: { title: string, questions: Array, settings: object } }
 *          | { ok: false, error: string }}
 */
export function validateRoomInput(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Body harus berupa objek JSON." }
  }

  const { title, questions } = payload

  if (typeof title !== "string") {
    return { ok: false, error: 'Field "title" wajib diisi dan harus berupa teks.' }
  }
  const cleanTitle = title.trim()
  if (cleanTitle.length === 0) {
    return { ok: false, error: "Judul kuis tidak boleh kosong." }
  }
  if (cleanTitle.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Judul kuis maksimal ${MAX_TITLE_LEN} karakter.` }
  }

  if (!Array.isArray(questions)) {
    return { ok: false, error: 'Field "questions" wajib diisi dan harus berupa array.' }
  }
  if (questions.length < MIN_QUESTIONS) {
    return { ok: false, error: `Kuis harus punya minimal ${MIN_QUESTIONS} soal.` }
  }
  if (questions.length > MAX_QUESTIONS) {
    return { ok: false, error: `Kuis maksimal ${MAX_QUESTIONS} soal.` }
  }

  const settingsResult = normalizeSettings(payload.settings)
  if (!settingsResult.ok) return { ok: false, error: settingsResult.error }
  const settings = settingsResult.value

  // Batas durasi per soal mengikuti settings: kalau pengguna menyetel
  // defaultTimeSec 300 (5 menit), soal 200 detik harus tetap diterima.
  const timeSecMax = Math.max(MAX_TIME_SEC, settings.defaultTimeSec)
  const timeSecOptional = settings.timeMode !== "per-question"

  const cleanQuestions = []
  for (let i = 0; i < questions.length; i += 1) {
    const result = normalizeQuestion(questions[i], `Soal ${i + 1}`, {
      timeSecOptional,
      timeSecMax,
      defaultTimeSec: settings.defaultTimeSec,
    })
    if (!result.ok) return result
    cleanQuestions.push(result.value)
  }

  return { ok: true, value: { title: cleanTitle, questions: cleanQuestions, settings } }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validasi body template (POST/PUT /api/templates).
 *
 * @param {any} payload
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function validateTemplateInput(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Body harus berupa objek JSON." }
  }

  if (typeof payload.title !== "string") {
    return { ok: false, error: 'Field "title" wajib diisi dan harus berupa teks.' }
  }
  const title = payload.title.trim()
  if (title.length === 0) return { ok: false, error: "Judul template tidak boleh kosong." }
  if (title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Judul template maksimal ${MAX_TITLE_LEN} karakter.` }
  }

  // ── Teks pendek opsional ──
  const textFields = [
    ["description", MAX_DESCRIPTION_LEN, "Deskripsi"],
    ["category", MAX_CATEGORY_LEN, "Kategori"],
    ["subject", MAX_SUBJECT_LEN, "Mata pelajaran"],
    ["gradeLevel", MAX_GRADE_LEVEL_LEN, "Tingkat kelas"],
  ]
  const strings = {}
  for (const [field, max, label] of textFields) {
    const raw = payload[field]
    if (raw === undefined || raw === null) {
      strings[field] = null
      continue
    }
    if (typeof raw !== "string") {
      return { ok: false, error: `Field "${field}" wajib berupa teks.` }
    }
    const clean = raw.trim()
    if (clean.length > max) {
      return { ok: false, error: `${label} maksimal ${max} karakter.` }
    }
    strings[field] = clean === "" ? null : clean
  }

  const tags = normalizeTags(payload.tags)
  if (tags === undefined) {
    return {
      ok: false,
      error: `Tag maksimal ${MAX_TAGS} buah, masing-masing maksimal ${MAX_TAG_LEN} karakter.`,
    }
  }

  const coverImage = normalizeImageUrl(payload.coverImage)
  if (coverImage === undefined) {
    return { ok: false, error: "URL gambar sampul tidak valid." }
  }

  let visibility = "private"
  if (payload.visibility !== undefined && payload.visibility !== null) {
    if (!VISIBILITIES.includes(payload.visibility)) {
      return { ok: false, error: 'Field "visibility" harus "private" atau "public".' }
    }
    visibility = payload.visibility
  }

  const settingsResult = normalizeSettings(payload.settings)
  if (!settingsResult.ok) return { ok: false, error: settingsResult.error }
  const settings = settingsResult.value

  const questions = payload.questions
  if (!Array.isArray(questions)) {
    return { ok: false, error: 'Field "questions" wajib diisi dan harus berupa array.' }
  }
  if (questions.length < MIN_QUESTIONS) {
    return { ok: false, error: `Template harus punya minimal ${MIN_QUESTIONS} soal.` }
  }
  if (questions.length > MAX_QUESTIONS) {
    return { ok: false, error: `Template maksimal ${MAX_QUESTIONS} soal.` }
  }

  const timeSecMax = Math.max(MAX_TIME_SEC, settings.defaultTimeSec)
  const timeSecOptional = settings.timeMode !== "per-question"

  const cleanQuestions = []
  for (let i = 0; i < questions.length; i += 1) {
    const result = normalizeQuestion(questions[i], `Soal ${i + 1}`, {
      timeSecOptional,
      timeSecMax,
      defaultTimeSec: settings.defaultTimeSec,
    })
    if (!result.ok) return result
    cleanQuestions.push(result.value)
  }

  return {
    ok: true,
    value: {
      title,
      description: strings.description,
      category: strings.category,
      subject: strings.subject,
      gradeLevel: strings.gradeLevel,
      tags,
      coverImage,
      visibility,
      settings,
      questions: cleanQuestions,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DRAFT (klien editor)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validasi satu draft quiz dari storage (lebih lunak: soal boleh masih kosong —
 * dipakai editor untuk menampilkan masalah per soal, bukan memblokir simpan).
 *
 * @param {{ title: string, questions: Array }} draft
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateDraft(draft) {
  const problems = []

  if (!draft || typeof draft !== "object") {
    return { ok: false, problems: ["Draft tidak valid."] }
  }

  const title = String(draft.title ?? "").trim()
  if (title.length === 0) problems.push("Judul kuis masih kosong.")
  else if (title.length > MAX_TITLE_LEN) problems.push(`Judul maksimal ${MAX_TITLE_LEN} karakter.`)

  const questions = Array.isArray(draft.questions) ? draft.questions : []
  if (questions.length === 0) problems.push("Tambahkan minimal 1 soal.")
  if (questions.length > MAX_QUESTIONS) problems.push(`Maksimal ${MAX_QUESTIONS} soal.`)

  questions.forEach((question, i) => {
    const label = `Soal ${i + 1}`
    const text = String(question?.text ?? "").trim()
    if (text.length === 0) {
      problems.push(`${label}: teks soal masih kosong.`)
      return
    }
    if (text.length > MAX_QUESTION_TEXT_LEN) {
      problems.push(`${label}: teks soal maksimal ${MAX_QUESTION_TEXT_LEN} karakter.`)
    }

    const options = Array.isArray(question?.options) ? question.options : []
    for (let j = 0; j < OPTION_COUNT; j += 1) {
      const option = String(options[j] ?? "").trim()
      if (option.length === 0) {
        problems.push(`${label}: opsi ${String.fromCharCode(65 + j)} masih kosong.`)
      } else if (option.length > MAX_OPTION_LEN) {
        problems.push(`${label}: opsi ${String.fromCharCode(65 + j)} maksimal ${MAX_OPTION_LEN} karakter.`)
      }
    }

    const correctIndex = question?.correctIndex
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= OPTION_COUNT) {
      problems.push(`${label}: tandai satu jawaban benar.`)
    }

    const timeSec = Number(question?.timeSec ?? DEFAULT_TIME_SEC)
    if (!Number.isInteger(timeSec) || timeSec < MIN_TIME_SEC || timeSec > MAX_TIME_SEC) {
      problems.push(`${label}: durasi harus ${MIN_TIME_SEC}–${MAX_TIME_SEC} detik.`)
    }

    if (normalizeImageUrl(question?.image) === undefined) {
      problems.push(`${label}: URL gambar soal tidak valid.`)
    }
    const optionImages = question?.optionImages
    if (Array.isArray(optionImages)) {
      optionImages.forEach((url, j) => {
        if (normalizeImageUrl(url) === undefined) {
          problems.push(`${label}: URL gambar opsi ${String.fromCharCode(65 + j)} tidak valid.`)
        }
      })
    }
    const explanation = question?.explanation
    if (typeof explanation === "string" && explanation.trim().length > MAX_EXPLANATION_LEN) {
      problems.push(`${label}: penjelasan maksimal ${MAX_EXPLANATION_LEN} karakter.`)
    }
  })

  return { ok: problems.length === 0, problems }
}
