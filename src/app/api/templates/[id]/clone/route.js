import { LIMITS, clientIp, consume, json, jsonError } from "@/lib/http"
import { requireUser } from "@/lib/auth"
import {
  findTemplateRow,
  incrementCloneCount,
  insertTemplate,
  toTemplate,
  viewTemplate,
} from "@/lib/db"

// Menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// POST /api/templates/[id]/clone — salin template jadi milik pemanggil.
//
// Aturan visibilitas mengikuti GET /api/templates/[id]: publik boleh dikloning
// siapa pun yang login, privat hanya boleh pemiliknya sendiri (404 untuk orang
// lain — jangan mengonfirmasi keberadaan id privat).
//
// Hasil kloning SELALU privat. Menyalin lalu menerbitkan ulang secara diam-diam
// akan membuat judul yang sudah ada tiba-tiba "dipublikasikan" oleh orang yang
// bukan pemilik aslinya.
export async function POST(request, { params }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { allowed, retryAfter } = consume(
    `template-write:${auth.user.id}:${clientIp(request)}`,
    LIMITS.templateWrite.max,
    LIMITS.templateWrite.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak perubahan template. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  const { id } = await params
  const source = findTemplateRow(id)
  if (!source) return jsonError("Template tidak ditemukan.", 404)

  const user = auth.user
  const isOwner = Number(source.owner_id) === Number(user.id)
  if (source.visibility !== "public" && !isOwner) {
    return jsonError("Template tidak ditemukan.", 404)
  }

  const newId = insertTemplate({
    ownerId: user.id,
    title: cloneTitle(source.title),
    description: source.description ?? null,
    category: source.category ?? null,
    subject: source.subject ?? null,
    gradeLevel: source.grade_level ?? null,
    tags: parseTags(source.tags),
    coverImage: source.cover_image ?? null,
    visibility: "private",
    settings: parseSettings(source.settings),
    questions: parseQuestions(source.questions),
  })

  incrementCloneCount(source.id)

  const created = findTemplateRow(newId)
  return json({ template: viewTemplate(toTemplate(created), user.id) }, 201)
}

/**
 * Judul salinan: " (Salinan)" ditambahkan selama masih muat di batas judul.
 * Tanpa ini, "Kuis Bab 3" yang dikloning tiga kali jadi tiga baris dengan nama
 * identik dan mustahil dibedakan di daftar.
 */
function cloneTitle(title) {
  const base = String(title ?? "").trim() || "Template"
  const suffix = " (Salinan)"
  const maxTitleLen = 80
  if (base.length + suffix.length <= maxTitleLen) return base + suffix
  return base.slice(0, maxTitleLen - suffix.length) + suffix
}

// ─── Kolom JSON dari baris sumber ──────────────────────────────────────────
// Baris template menyimpan tags/settings/questions sebagai TEXT berisi JSON.
// Nilai yang rusak (mis. baris lama atau tulisan manual) tidak boleh
// menggagalkan kloning: kloning yang gagal karena satu kolom cacat lebih buruk
// daripada salinan dengan isi yang wajar.

/** JSON array tag dari kolom TEXT. */
function parseTags(raw) {
  const parsed = safeParse(raw)
  if (!Array.isArray(parsed)) return []
  return parsed.filter((tag) => typeof tag === "string")
}

/** JSON objek settings dari kolom TEXT. */
function parseSettings(raw) {
  const parsed = safeParse(raw)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return parsed
}

/** JSON array soal dari kolom TEXT. */
function parseQuestions(raw) {
  const parsed = safeParse(raw)
  return Array.isArray(parsed) ? parsed : []
}

function safeParse(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
