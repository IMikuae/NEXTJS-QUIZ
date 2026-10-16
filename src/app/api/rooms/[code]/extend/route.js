import { hostTokenFrom, json, jsonError, readJsonBody } from "@/lib/http"
import { throttleHostAction } from "@/lib/host-actions"
import { extendQuestion } from "@/lib/quiz-store"

// quiz-store.js mengimpor db.js (node:sqlite) untuk mengarsipkan sesi, jadi
// modul ini hanya bisa dimuat di runtime Node — bukan Edge.
export const runtime = "nodejs"

// POST /api/rooms/{code}/extend — host menambah waktu soal aktif (+10 detik,
// default). Server tetap source of truth: hanya fase `question` dengan
// deadline yang belum lewat boleh diperpanjang, dan ada batas per soal
// (lihat MAX_EXTEND_PER_QUESTION di quiz-store).
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

  const amountSec = Number.isInteger(body.data?.amountSec) ? body.data.amountSec : undefined
  const result = extendQuestion(code, hostToken, amountSec)

  if (result.error) {
    return jsonError(result.error, result.code)
  }

  return json(
    {
      ok: true,
      secondsLeft: result.secondsLeft,
      questionDeadline: result.questionDeadline,
      version: result.version,
    },
    200
  )
}
