import { hostTokenFrom, json, jsonError, readJsonBody } from "@/lib/http"
import { throttleHostAction } from "@/lib/host-actions"
import { endSession } from "@/lib/quiz-store"

// Route ini memanggil archiveRoom() lewat quiz-store → menyentuh SQLite.
export const runtime = "nodejs"

// POST /api/rooms/{code}/end — host mengakhiri sesi SEKARANG.
//
// Dari fase apa pun (lobby / question / reveal) → `finished`. Hasil akhir
// dihitung lalu diarsipkan ke rooms_archive. Kegagalan arsip tidak pernah
// menggagalkan pengakhiran sesi — lihat archiveFinishedRoom() di quiz-store.
export async function POST(request, { params }) {
  const { code } = await params

  const limited = throttleHostAction(request)
  if (limited) return limited

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const hostToken = hostTokenFrom(request, body.data)
  if (!hostToken) {
    return jsonError("Token host wajib dikirim (body atau header X-Host-Token).", 403)
  }

  const result = endSession(code, hostToken)
  if (result.error) {
    return jsonError(result.error, result.code)
  }

  return json({ ok: true, version: result.version }, 200)
}
