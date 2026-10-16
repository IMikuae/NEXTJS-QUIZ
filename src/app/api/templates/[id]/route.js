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
import { deleteTemplate, findTemplateRow, toTemplate, updateTemplate, viewTemplate } from "@/lib/db"
import { validateTemplateInput } from "@/lib/quiz-validate"

// Menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

/** Template privat hanya boleh dibuka pemiliknya; selain itu 404 (bukan 403). */
function notFound() {
  return jsonError("Template tidak ditemukan.", 404)
}

// GET /api/templates/[id] — satu template.
//
// Template privat dibalas 404, BUKAN 403, bila bukan milik penonton: 403
// mengonfirmasi bahwa id itu ada, dan itu sudah informasi yang tidak perlu
// dibagikan ke orang lain.
export async function GET(request, { params }) {
  const { id } = await params
  const row = findTemplateRow(id)
  if (!row) return notFound()

  const user = await getAuthUser()
  const isOwner = user && Number(row.owner_id) === Number(user.id)
  if (row.visibility !== "public" && !isOwner) return notFound()

  return json({ template: viewTemplate(toTemplate(row), user?.id ?? null) }, 200)
}

// PUT /api/templates/[id] — ganti template (hanya pemilik).
export async function PUT(request, { params }) {
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
  const row = findTemplateRow(id)

  // Bukan pemilik → 404, bukan 403: konsisten dengan GET di atas.
  if (!row || Number(row.owner_id) !== Number(auth.user.id)) return notFound()

  const body = await readJsonBody(request, MAX_TEMPLATE_BODY_BYTES)
  if (!body.ok) return body.response

  const validated = validateTemplateInput(body.data)
  if (!validated.ok) return jsonError(validated.error, 400)

  updateTemplate(row.id, validated.value)
  const updated = findTemplateRow(row.id)

  return json({ template: viewTemplate(toTemplate(updated), auth.user.id) }, 200)
}

// DELETE /api/templates/[id] — hapus template (hanya pemilik).
export async function DELETE(request, { params }) {
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
  const row = findTemplateRow(id)
  if (!row || Number(row.owner_id) !== Number(auth.user.id)) return notFound()

  deleteTemplate(row.id)

  return json({ ok: true }, 200)
}
