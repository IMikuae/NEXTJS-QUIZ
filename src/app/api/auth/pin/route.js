import {
  createSessionForUser,
  destroySessionsForUser,
  hashPin,
  requireUser,
  setSessionCookie,
  validatePin,
  verifyPin,
} from "@/lib/auth"
import { findUserByName, setUserPin } from "@/lib/db"
import { LIMITS, clientIp, consume, json, jsonError, readJsonBody } from "@/lib/http"

// Route ini menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// POST /api/auth/pin — ganti PIN sendiri.
//
// Aturan (CONTRACT §3): PIN lama wajib dikonfirmasi, PIN baru harus 6 digit,
// dan tidak boleh sama dengan PIN lama. Konfirmasi PIN lama WAJIB — tanpa itu
// siapa pun yang memegang sesi yang belum terkunci bisa mengunci pemiliknya
// keluar dari akunnya sendiri.
export async function POST(request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  // Rate limit: verifikasi PIN lama di sini sama sensitifnya dengan login.
  // Tanpa batas, sesi yang dicuri bisa dipakai menyikat kombinasi PIN lama
  // sampai berhasil, lalu mengambil alih akun.
  const { allowed, retryAfter } = consume(
    `auth-pin:${auth.user.id}:${clientIp(request)}`,
    LIMITS.login.max,
    LIMITS.login.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak percobaan. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const currentPin = toPinString(body.data?.currentPin)
  const newPin = toPinString(body.data?.newPin)

  if (currentPin === "") return jsonError("PIN lama wajib diisi.", 400)

  const newPinError = validatePin(newPin)
  if (newPinError) return jsonError(newPinError, 400)
  if (currentPin === newPin) {
    return jsonError("PIN baru tidak boleh sama dengan PIN lama.", 400)
  }

  // Baris mentah dibutuhkan untuk memverifikasi PIN lama; `pin_hash` tidak
  // pernah keluar dari lapisan db/auth.
  const row = findUserByName(auth.user.name)
  if (!row || row.id !== auth.user.id) {
    return jsonError("Akun tidak ditemukan.", 404)
  }
  if (!verifyPin(currentPin, row.pin_hash)) {
    return jsonError("PIN lama tidak cocok.", 401)
  }

  setUserPin(auth.user.id, hashPin(newPin))

  // Cabut SEMUA sesi akun ini, lalu buat sesi baru untuk perangkat yang
  // sedang dipakai mengganti PIN. Kalau sesi lama dibiarkan hidup, cookie
  // yang sudah bocor/di perangkat lain tetap valid setelah pemilik mengganti
  // PIN — padahal mengganti PIN justru dilakukan untuk itu.
  destroySessionsForUser(auth.user.id)
  const freshToken = createSessionForUser(auth.user.id)
  await setSessionCookie(freshToken)

  return json({ ok: true }, 200)
}

/** PIN dari body apa pun → string bersih (angka 123456 juga diterima). */
function toPinString(value) {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}
