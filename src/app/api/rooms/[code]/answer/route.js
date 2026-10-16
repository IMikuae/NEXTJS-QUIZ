import { LIMITS, consume, json, jsonError, readJsonBody } from "@/lib/http"
import { submitAnswer } from "@/lib/quiz-store"

// quiz-store.js mengimpor db.js (node:sqlite) untuk mengarsipkan sesi, jadi
// modul ini hanya bisa dimuat di runtime Node — bukan Edge.
export const runtime = "nodejs"

// POST /api/rooms/{code}/answer — pemain mengirim jawaban untuk soal aktif.
//
// Bentuk balasan berbeda menurut mode & settings (lihat submitAnswer):
//
//   live  → selalu memuat correct/correctIndex/distribution (perilaku lama;
//           respons ini PRIVAT ke pemain yang jawabannya sudah terkunci).
//   exam  → correct/correctIndex/explanation HANYA ikut bila
//           settings.instantFeedback atau settings.showExplanation menyala.
//           Dengan keduanya mati, balasan hanya berisi progres — itu inti
//           anti-bocornya. Jangan pernah menambahkan field kunci jawaban ke
//           cabang ini.
//
// Route sengaja meneruskan `result` apa adanya (tanpa daftar field manual)
// supaya bentuk balasan hanya ditentukan di satu tempat — quiz-store.js —
// dan tidak ada kesempatan menambah field bocor di lapisan HTTP.
export async function POST(request, { params }) {
  const { code } = await params

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const { playerId, token, questionIndex, optionIndex } = body.data

  if (typeof playerId !== "string" || typeof token !== "string") {
    return jsonError("playerId dan token wajib dikirim.", 403)
  }
  if (!Number.isInteger(questionIndex)) {
    return jsonError("questionIndex wajib berupa bilangan bulat.", 400)
  }

  // Rate limit per pemain (bukan per IP) supaya satu kelas di belakang NAT
  // yang sama tidak saling memakan jatah.
  const { allowed, retryAfter } = consume(
    `answer:${String(code).toUpperCase()}:${playerId}`,
    LIMITS.answer.max,
    LIMITS.answer.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak jawaban terkirim. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  const result = submitAnswer(code, { playerId, token, questionIndex, optionIndex })

  if (result.error) {
    return jsonError(result.error, result.code)
  }

  return json({ ...result }, 200)
}
