import { LIMITS, clientIp, consume, json, jsonError, readJsonBody } from "@/lib/http"
import { createSessionForUser, pruneExpiredSessions, setSessionCookie, verifyPin } from "@/lib/auth"
import { findUserByName } from "@/lib/db"

// Route ini menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// POST /api/auth/login — masuk dengan nama + PIN.
//
// Pesan gagal SELALU sama ("Nama atau PIN tidak cocok.") baik nama tidak ada
// maupun PIN salah: membedakannya akan mengubah endpoint ini menjadi alat
// untuk memetakan nama akun yang terdaftar.
export async function POST(request) {
  pruneExpiredSessions()

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
  const name = typeof payload.name === "string" ? payload.name.trim() : ""
  const pin = payload.pin === undefined || payload.pin === null ? "" : String(payload.pin).trim()

  if (name === "" || pin === "") {
    return jsonError("Nama atau PIN tidak cocok.", 401)
  }

  const row = findUserByName(name)
  if (!row || !verifyPin(pin, row.pin_hash)) {
    return jsonError("Nama atau PIN tidak cocok.", 401)
  }

  const token = createSessionForUser(row.id)
  await setSessionCookie(token)

  return json(
    {
      ok: true,
      user: {
        id: row.id,
        name: row.name,
        role: row.role,
        kelas: row.kelas ?? null,
        createdAt: row.created_at ?? null,
      },
    },
    200
  )
}
