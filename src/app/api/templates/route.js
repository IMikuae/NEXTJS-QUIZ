import {
  LIMITS,
  MAX_TEMPLATE_BODY_BYTES,
  clientIp,
  consume,
  json,
  jsonError,
  readJsonBody,
} from "@/lib/http"
import { getAuthUser, requireUser } from "@/lib/auth"
import {
  findTemplateRow,
  insertTemplate,
  listTemplates,
  toTemplate,
  viewTemplate,
} from "@/lib/db"
import { validateTemplateInput } from "@/lib/quiz-validate"

// Menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// GET /api/templates — daftar template.
//
//   ?mine=1        → WAJIB login; hanya template milik sendiri (termasuk privat)
//   ?all=1         → KHUSUS admin; semua template dari semua akun (moderasi)
//   ?q=            → cari di judul/deskripsi/subject/tags
//   ?category=     → filter kategori
//   ?subject=      → filter mata pelajaran
//   ?gradeLevel=   → filter jenjang/kelas
//   ?tag=          → filter satu tag
//   ?facets=1      → sertakan daftar subject/gradeLevel/tag yang tersedia
//   tanpa mine/all → hanya template ber-visibility "public"
//
// Template privat TIDAK PERNAH muncul di daftar publik — filternya di SQL
// (listTemplates), bukan di JavaScript, supaya tidak ada jalur yang bisa lupa
// menyaring.
export async function GET(request) {
  const url = new URL(request.url)
  const mine = url.searchParams.get("mine") === "1"
  const all = url.searchParams.get("all") === "1"
  const q = (url.searchParams.get("q") ?? "").trim()
  const category = (url.searchParams.get("category") ?? "").trim()
  const subject = (url.searchParams.get("subject") ?? "").trim()
  const gradeLevel = (url.searchParams.get("gradeLevel") ?? "").trim()
  const tag = (url.searchParams.get("tag") ?? "").trim()
  const withFacets = url.searchParams.get("facets") === "1"

  const user = await getAuthUser()

  if (mine && !user) {
    return jsonError("Kamu harus masuk dulu.", 401)
  }
  if (all && user?.role !== "admin") {
    return jsonError("Hanya admin yang boleh melihat semua template.", 403)
  }

  // `all` (admin) melihat semuanya termasuk privat; `mine` hanya milik sendiri;
  // selain itu hanya publik.
  const scope = all ? "all" : mine ? "mine" : "public"

  const rows = listTemplates({
    ownerId: mine ? user.id : null,
    publicOnly: scope === "public",
    q: q || null,
    category: category || null,
    subject: subject || null,
    gradeLevel: gradeLevel || null,
    tag: tag || null,
  })

  const payload = { templates: rows.map((row) => viewTemplate(row, user?.id ?? null)) }

  // Facet = nilai unik yang benar-benar ada di himpunan hasil (sebelum filter
  // subject/grade/tag diterapkan) supaya UI tidak menawarkan filter kosong.
  if (withFacets) {
    const base = listTemplates({
      ownerId: mine ? user.id : null,
      publicOnly: scope === "public",
      q: q || null,
      category: category || null,
    })
    payload.facets = buildFacets(base)
  }

  return json(payload, 200)
}

/** Kumpulkan nilai unik subject/gradeLevel/tag dari daftar template. */
function buildFacets(rows) {
  const subjects = new Set()
  const gradeLevels = new Set()
  const tags = new Set()
  for (const row of rows) {
    if (row.subject) subjects.add(row.subject)
    if (row.gradeLevel) gradeLevels.add(row.gradeLevel)
    for (const tag of row.tags ?? []) tags.add(tag)
  }
  const sorted = (set) => Array.from(set).sort((a, b) => a.localeCompare(b, "id"))
  return {
    subjects: sorted(subjects),
    gradeLevels: sorted(gradeLevels),
    tags: sorted(tags),
  }
}

// POST /api/templates — buat template baru (wajib login).
export async function POST(request) {
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

  const body = await readJsonBody(request, MAX_TEMPLATE_BODY_BYTES)
  if (!body.ok) return body.response

  const validated = validateTemplateInput(body.data)
  if (!validated.ok) return jsonError(validated.error, 400)

  const id = insertTemplate({ ...validated.value, ownerId: auth.user.id })
  const row = findTemplateRow(id)

  return json({ template: viewTemplate(toTemplate(row), auth.user.id) }, 201)
}
