"use client"

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ STORAGE — draft quiz & template pribadi pengguna di localStorage.
// ═══════════════════════════════════════════════════════════════════════════
// Data dipisah per PEMILIK (id akun dari auth-store, atau "tamu" bila belum
// login). Bentuk tersimpan:
//
//   yuequiz:quizzes:v1   → { "<ownerId>": Quiz[], ... }
//   yuequiz:templates:v1 → { "<ownerId>": Quiz[], ... }
//
// Format lama (array datar, sebelum ada login) dimigrasikan otomatis ke
// namespace "tamu" saat pertama dibaca — tidak ada data pengguna yang hilang.
//
// Semua fungsi: guard `typeof window === "undefined"` (dipanggil saat SSR
// tidak crash), try-catch JSON/setItem, dan QuotaExceededError dipetakan ke
// error "quota" (bukan throw) supaya handler UI cukup memeriksa `result.ok`.
//
// Bentuk Quiz:
//   { id, kind: "quiz"|"template", title, description, category,
//     status: "draft"|"published", sourceTemplateId, templateId,
//     settings: object|null, createdAt, updatedAt,
//     questions: [{ text, options:[4], correctIndex, timeSec,
//                   image, optionImages:[4], explanation }] }
//
// KAMUS SINGKAT:
//   settings    — aturan permainan (mode, waktu, penilaian) — CONTRACT §1.
//   templateId  — id template SERVER bila draft ini pernah disimpan sebagai
//                 template; null berarti belum pernah (editor akan POST).
//
// PERINGATAN: modul ini adalah draft EDITOR (localStorage) dan TIDAK PERNAH
// dipakai di jalur ujian. Mode ujian tidak menyimpan apa pun di browser selain
// identitas pemain di sessionStorage (CONTRACT §8).
// ═══════════════════════════════════════════════════════════════════════════

import { GUEST_OWNER_ID, currentOwnerId } from "./auth-store"

export const QUIZZES_KEY = "yuequiz:quizzes:v1"
export const TEMPLATES_KEY = "yuequiz:templates:v1"

/** ID unik sederhana — timestamp base36 + 3 karakter acak. */
function newId() {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/**
 * Baca seluruh peta { ownerId: Quiz[] }.
 * Migrasi format lama (array datar) → { "tamu": [...] } sekali saja.
 */
function readMap(key) {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)

    // Format lama: array datar → pindahkan ke namespace tamu.
    if (Array.isArray(parsed)) {
      const migrated = { [GUEST_OWNER_ID]: parsed }
      window.localStorage.setItem(key, JSON.stringify(migrated))
      return migrated
    }

    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Tulis peta. Membedakan kuota penuh dari kegagalan lain.
 * @returns {{ ok: true } | { ok: false, error: "quota" }}
 */
function writeMap(key, map) {
  if (typeof window === "undefined") return { ok: true }
  try {
    window.localStorage.setItem(key, JSON.stringify(map))
    return { ok: true }
  } catch (error) {
    if (error && (error.name === "QuotaExceededError" || error.code === 22)) {
      return { ok: false, error: "quota" }
    }
    // Storage diblokir total (private mode ketat) — perlakukan sama.
    return { ok: false, error: "quota" }
  }
}

/** Daftar quiz MILIK PEMILIK AKTIF, terbaru dulu. */
function listOwned(key) {
  const map = readMap(key)
  const rows = map[currentOwnerId()]
  return Array.isArray(rows) ? rows : []
}

/** Simpan daftar quiz milik pemilik aktif (namespace lain tidak tersentuh). */
function saveOwned(key, rows) {
  const map = readMap(key)
  map[currentOwnerId()] = rows
  return writeMap(key, map)
}

/**
 * Semua entri milik pengguna aktif — quiz DAN template pribadi, terbaru dulu.
 * Digabung supaya "Kuis Saya" menampilkan tab "Template Saya" dan tombol
 * Duplikat/Hapus pada template tetap berfungsi.
 */
export function listQuizzes() {
  const combined = [...listOwned(QUIZZES_KEY), ...listOwned(TEMPLATES_KEY)]
  return combined.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/**
 * Cari satu entri di KEDUA namespace (quiz & template pribadi) dan kembalikan
 * kunci tempat ia tinggal. Template hidup di TEMPLATES_KEY, jadi mencari hanya
 * di QUIZZES_KEY membuat template tidak bisa dibuka/diedit.
 * @returns {{ key: string, row: object } | null}
 */
function locate(id) {
  for (const key of [QUIZZES_KEY, TEMPLATES_KEY]) {
    const row = listOwned(key).find((item) => item.id === id)
    if (row) return { key, row }
  }
  return null
}

/** Satu quiz ATAU template pribadi berdasarkan id (atau null). */
export function getQuiz(id) {
  return locate(id)?.row ?? null
}

/**
 * Buat draft baru untuk pengguna aktif.
 * @param {{ title?: string, description?: string, category?: string,
 *           subject?: string|null, gradeLevel?: string|null, tags?: string[],
 *           coverImage?: string|null, visibility?: string,
 *           sourceTemplateId?: string|null, templateId?: number|null,
 *           settings?: object|null, questions?: Array }} input
 * @returns {{ ok: true, data: object } | { ok: false, error: "quota" }}
 */
export function createQuiz(input = {}) {
  const now = Date.now()
  const quiz = {
    id: newId(),
    kind: "quiz",
    title: String(input.title ?? "Kuis Baru").slice(0, 80),
    description: String(input.description ?? ""),
    category: String(input.category ?? "umum"),
    subject: input.subject ?? null,
    gradeLevel: input.gradeLevel ?? null,
    tags: Array.isArray(input.tags) ? input.tags : [],
    coverImage: input.coverImage ?? null,
    visibility: input.visibility === "public" ? "public" : "private",
    status: "draft",
    sourceTemplateId: input.sourceTemplateId ?? null,
    // ID template SERVER tempat draft ini pernah disimpan (kalau ada) —
    // dipakai editor untuk memutuskan POST (buat baru) atau PUT (perbarui).
    templateId: input.templateId ?? null,
    // Aturan permainan (CONTRACT §1). null = pakai bawaan server.
    settings: input.settings ?? null,
    createdAt: now,
    updatedAt: now,
    questions: Array.isArray(input.questions) ? input.questions : [],
  }
  const result = saveOwned(QUIZZES_KEY, [quiz, ...listOwned(QUIZZES_KEY)])
  if (!result.ok) return result
  return { ok: true, data: quiz }
}

/**
 * Patch satu quiz ATAU template pribadi (set `updatedAt` otomatis).
 * Menulis kembali ke namespace ASAL entri — template tetap jadi template.
 * @returns {{ ok: true, data: object } | { ok: false, error: "not_found"|"quota" } }
 */
export function updateQuiz(id, patch) {
  const found = locate(id)
  if (!found) return { ok: false, error: "not_found" }

  const rows = listOwned(found.key)
  const index = rows.findIndex((row) => row.id === id)

  const updated = {
    ...rows[index],
    ...patch,
    id: rows[index].id, // id, kind & createdAt tidak boleh berubah via patch
    kind: rows[index].kind,
    createdAt: rows[index].createdAt,
    updatedAt: Date.now(),
  }
  const next = [...rows]
  next[index] = updated

  const result = saveOwned(found.key, next)
  if (!result.ok) return result
  return { ok: true, data: updated }
}

/**
 * Duplikat quiz → salinan baru berjudul "X (salinan)", status draft.
 * @returns {{ ok: true, data: object } | { ok: false, error: "not_found"|"quota" }}
 */
export function duplicateQuiz(id) {
  const source = getQuiz(id)
  if (!source) return { ok: false, error: "not_found" }

  const now = Date.now()
  const copy = {
    ...structuredClone(source),
    id: newId(),
    kind: "quiz",
    title: `${source.title} (salinan)`.slice(0, 80),
    status: "draft",
    sourceTemplateId: source.kind === "template" ? source.id : source.sourceTemplateId,
    createdAt: now,
    updatedAt: now,
  }
  const result = saveOwned(QUIZZES_KEY, [copy, ...listOwned(QUIZZES_KEY)])
  if (!result.ok) return result
  return { ok: true, data: copy }
}

/**
 * @returns {{ ok: true } | { ok: false, error: "not_found"|"quota" }}
 *
 * Menghapus dari DUA namespace: quiz biasa (QUIZZES_KEY) dan template pribadi
 * (TEMPLATES_KEY). Sebelumnya hanya quiz yang dihapus, sehingga template yang
 * dibuat lewat "Simpan sbg Template" tidak bisa dibuang selamanya.
 */
export function deleteQuiz(id) {
  let found = false

  for (const key of [QUIZZES_KEY, TEMPLATES_KEY]) {
    const rows = listOwned(key)
    const next = rows.filter((row) => row.id !== id)
    if (next.length === rows.length) continue

    found = true
    const result = saveOwned(key, next)
    if (!result.ok) return result
  }

  if (!found) return { ok: false, error: "not_found" }
  return { ok: true }
}

/**
 * Simpan quiz sebagai TEMPLATE pribadi (namespace milik pengguna aktif).
 * @returns {{ ok: true, data: object } | { ok: false, error: "not_found"|"quota" }}
 */
export function saveQuizAsTemplate(id) {
  const source = getQuiz(id)
  if (!source) return { ok: false, error: "not_found" }

  const now = Date.now()
  const template = {
    ...structuredClone(source),
    id: newId(),
    kind: "template",
    status: "published",
    sourceTemplateId: source.kind === "template" ? source.sourceTemplateId : source.id,
    createdAt: now,
    updatedAt: now,
  }
  const result = saveOwned(TEMPLATES_KEY, [template, ...listOwned(TEMPLATES_KEY)])
  if (!result.ok) return result
  return { ok: true, data: template }
}

/** Template pribadi pengguna aktif saja. */
export function listUserTemplates() {
  return listOwned(TEMPLATES_KEY).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

/** Diagnostik: berapa byte terpakai + jumlah quiz pengguna aktif. null di server. */
export function storageUsage() {
  if (typeof window === "undefined") return null
  try {
    const quizzesRaw = window.localStorage.getItem(QUIZZES_KEY) || ""
    const templatesRaw = window.localStorage.getItem(TEMPLATES_KEY) || ""
    return {
      bytes: quizzesRaw.length + templatesRaw.length,
      quizCount: listOwned(QUIZZES_KEY).length,
      templateCount: listOwned(TEMPLATES_KEY).length,
    }
  } catch {
    return null
  }
}

/**
 * Pindahkan SEMUA data milik "tamu" ke akun yang baru login.
 * Dipakai supaya quiz yang dibuat sebelum mendaftar tidak "hilang" begitu
 * pengguna punya akun — perilaku yang diharapkan, bukan kejutan.
 * @returns {{ ok: boolean, moved: number }}
 */
export function claimGuestData() {
  const owner = currentOwnerId()
  if (owner === GUEST_OWNER_ID) return { ok: true, moved: 0 }

  let moved = 0
  for (const key of [QUIZZES_KEY, TEMPLATES_KEY]) {
    const map = readMap(key)
    const guestRows = map[GUEST_OWNER_ID]
    if (!Array.isArray(guestRows) || guestRows.length === 0) continue

    // Hindari ID bentrok dengan data akun yang sudah ada.
    const existing = Array.isArray(map[owner]) ? map[owner] : []
    const existingIds = new Set(existing.map((row) => row.id))
    const incoming = guestRows.map((row) => ({
      ...row,
      id: existingIds.has(row.id) ? newId() : row.id,
    }))

    map[owner] = [...incoming, ...existing]
    delete map[GUEST_OWNER_ID]
    moved += incoming.length

    const result = writeMap(key, map)
    if (!result.ok) return { ok: false, moved }
  }
  return { ok: true, moved }
}
