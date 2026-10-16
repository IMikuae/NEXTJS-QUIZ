import { LIMITS, clientIp, consume, json, jsonError, readJsonBody } from "@/lib/http"
import {
  createSessionForUser,
  hashPin,
  nameTaken,
  pruneExpiredSessions,
  setSessionCookie,
  validatePublicAccount,
} from "@/lib/auth"
import { createUser } from "@/lib/db"

// Route ini menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// POST /api/auth/register — buat akun baru + langsung masuk.
//
// Body: { name, pin, role, kelas? } — sama persis dengan CONTRACT §3. Pesan
// error validasi memakai modul bersama auth.js supaya aturan server dan klien
// tidak pernah berbeda.
//
// KEAMANAN: peran yang diterima HANYA guru|siswa (validatePublicAccount).
// `admin` sengaja ditolak di sini — kalau tidak, siapa pun bisa memberi dirinya
// sendiri peran admin dan seluruh penjaga `requireAdmin` jadi sia-sia. Akun
// admin dibuat lewat POST /api/auth/accounts oleh admin yang sudah masuk.
export async function POST(request) {
  pruneExpiredSessions()

  // Jatah yang SAMA dengan login (kunci `auth:`) — kalau dipisah, satu
  // penyerang mendapat dua kali lipat percobaan per menit dari satu IP.
  const { allowed, retryAfter } = consume(
    `auth:${clientIp(request)}`,
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

  const payload = body.data ?? {}
  const name = typeof payload.name === "string" ? payload.name.trim() : payload.name
  const pin = payload.pin === undefined || payload.pin === null ? "" : String(payload.pin).trim()
  const role = payload.role
  const kelas = payload.kelas ?? null

  const validationError = validatePublicAccount({ name, pin, role, kelas })
  if (validationError) return jsonError(validationError, 400)

  if (nameTaken(name)) {
    return jsonError("Nama itu sudah dipakai. Pilih nama lain atau masuk.", 409)
  }

  let created
  try {
    created = createUser({
      name,
      role,
      kelas: role === "siswa" ? kelas : null,
      pinHash: hashPin(pin),
    })
  } catch {
    // Jaring pengaman UNIQUE constraint: balapan atau nama yang hanya beda
    // huruf besar/kecil tidak boleh berubah jadi 500 dengan jejak internal.
    return jsonError("Nama itu sudah dipakai. Pilih nama lain atau masuk.", 409)
  }

  const token = createSessionForUser(created.id)
  await setSessionCookie(token)

  return json({ ok: true, user: created.user }, 201)
}
