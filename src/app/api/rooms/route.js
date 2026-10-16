import {
  MAX_BODY_BYTES,
  LIMITS,
  baseUrl,
  clientIp,
  consume,
  json,
  jsonError,
  readJsonBody,
} from "@/lib/http"
import { createRoom, pruneRooms } from "@/lib/quiz-store"
import { validateRoomInput } from "@/lib/quiz-validate"
import { getAuthUser } from "@/lib/auth"

// SQLite dipakai untuk membaca pemilik room (bila host login) — dipakai arsip.
export const runtime = "nodejs"

// POST /api/rooms — buat room kuis baru.
//
// Alur: rate limit → baca body berbatas → validasi → buat room.
// Rate limit dicek lebih dulu supaya request yang ditolak tidak memakan CPU
// untuk membaca payload besar.
export async function POST(request) {
  // Lazy cleanup: sekalian buang room yang sudah lebih dari 3 jam.
  pruneRooms()

  const { allowed, retryAfter } = consume(
    `create-room:${clientIp(request)}`,
    LIMITS.createRoom.max,
    LIMITS.createRoom.windowMs
  )
  if (!allowed) {
    return jsonError(
      "Terlalu banyak kuis dibuat dari koneksi ini. Coba lagi sebentar lagi.",
      429,
      { "Retry-After": String(retryAfter) }
    )
  }

  const body = await readJsonBody(request, MAX_BODY_BYTES)
  if (!body.ok) return body.response

  const validated = validateRoomInput(body.data)
  if (!validated.ok) {
    return jsonError(validated.error, 400)
  }

  // Login TIDAK wajib untuk membuat kuis (siapa pun boleh jadi host), tapi
  // kalau host sedang login, arsip sesi bisa dikaitkan ke akunnya.
  const user = await getAuthUser()

  const { room } = createRoom({
    title: validated.value.title,
    questions: validated.value.questions,
    settings: validated.value.settings,
    hostUser: user?.id ?? null,
  })
  const origin = baseUrl(request)

  // hostToken hanya pernah muncul di respons ini — tidak ada endpoint yang
  // bisa membacanya kembali. Kalau host kehilangan tokennya, room itu tidak
  // bisa dimulai lagi (dan akan dibuang otomatis dalam 3 jam).
  return json(
    {
      code: room.code,
      hostToken: room.hostToken,
      hostUrl: `${origin}/host/${room.code}`,
      playUrl: `${origin}/play/${room.code}`,
    },
    201
  )
}
