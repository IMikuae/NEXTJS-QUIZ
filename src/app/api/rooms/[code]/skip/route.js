import { hostTokenFrom, json, jsonError, readJsonBody } from "@/lib/http"
import { throttleHostAction } from "@/lib/host-actions"
import { skipQuestion } from "@/lib/quiz-store"

// quiz-store.js mengimpor db.js (node:sqlite) untuk mengarsipkan sesi, jadi
// modul ini hanya bisa dimuat di runtime Node — bukan Edge.
export const runtime = "nodejs"

// POST /api/rooms/{code}/skip — host melewati soal aktif: paksa fase
// question → reveal sekarang (distribusi & "Tidak menjawab" tampil seperti
// alur normal). Host lalu menekan "Soal Berikutnya" seperti biasa.
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

  const result = skipQuestion(code, hostToken)

  if (result.error) {
    return jsonError(result.error, result.code)
  }

  return json(
    {
      ok: true,
      phase: result.phase,
      currentIndex: result.currentIndex,
      version: result.version,
    },
    200
  )
}
