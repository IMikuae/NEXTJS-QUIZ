import { LIMITS, clientIp, consume, json, jsonError } from "@/lib/http"
import { getTemplateById, templateToQuiz } from "@/lib/templates-data.server"

// Data penuh template bawaan (dengan kunci jawaban) sengaja TIDAK ikut ke
// bundel klien. Klien memintanya dari sini hanya saat pengguna memilih
// memakai/menyalin template bawaan.
export const runtime = "nodejs"

// GET /api/templates/builtin/[id] — data lengkap template bawaan.
//
// Mengembalikan bentuk siap pakai `createQuiz` (kunci jawaban ikut) untuk id
// bawaan seperti "tpl-perkalian-cepat". Id tak dikenal → 404.
export async function GET(request, { params }) {
  const { allowed, retryAfter } = consume(
    `builtin-read:${clientIp(request)}`,
    LIMITS.builtinRead.max,
    LIMITS.builtinRead.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak permintaan. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  const { id } = await params
  const template = getTemplateById(String(id))
  if (!template) return jsonError("Template tidak ditemukan.", 404)

  return json({ quiz: templateToQuiz(template) }, 200)
}
