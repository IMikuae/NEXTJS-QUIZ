import { LIMITS, clientIp, consume, json, jsonError, readJsonBody } from "@/lib/http"
import { joinRoom } from "@/lib/quiz-store"

// quiz-store.js mengimpor db.js (node:sqlite) untuk mengarsipkan sesi, jadi
// modul ini hanya bisa dimuat di runtime Node — bukan Edge.
export const runtime = "nodejs"

// POST /api/rooms/{code}/join — pemain masuk ke room.
//
// Mode exam: bergabung SETELAH kuis dimulai tetap boleh (jam tiap pemain
// berjalan sendiri). Mode live: hanya di lobby — lihat joinRoom().
//
// Next.js 16: `params` adalah Promise, jadi harus di-await.
export async function POST(request, { params }) {
  const { code } = await params

  const { allowed, retryAfter } = consume(
    `join:${clientIp(request)}`,
    LIMITS.join.max,
    LIMITS.join.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak percobaan gabung. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const result = joinRoom(code, body.data?.name)

  if (result.error) {
    return jsonError(result.error, result.code)
  }

  const { player } = result
  return json(
    {
      playerId: player.id,
      token: player.token,
      name: player.name,
      code: String(code).trim().toUpperCase(),
    },
    200
  )
}
