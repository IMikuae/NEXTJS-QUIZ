import { hostTokenFrom, json, jsonError, readJsonBody } from "@/lib/http"
import { throttleHostAction } from "@/lib/host-actions"
import { startQuiz } from "@/lib/quiz-store"

// quiz-store.js mengimpor db.js (node:sqlite) untuk mengarsipkan sesi, jadi
// modul ini hanya bisa dimuat di runtime Node — bukan Edge.
export const runtime = "nodejs"

// POST /api/rooms/{code}/start — host memulai kuis (lobby → soal pertama).
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

  const result = startQuiz(code, hostToken)
  if (result.error) {
    return jsonError(result.error, result.code)
  }

  return json({ ok: true, version: result.version }, 200)
}
