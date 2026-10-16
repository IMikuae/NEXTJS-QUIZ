import { hashPin, requireAdmin, validateAccount } from "@/lib/auth"
import { createUser, listUsers } from "@/lib/db"
import { LIMITS, clientIp, consume, json, jsonError, readJsonBody } from "@/lib/http"

// Route ini menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// GET /api/auth/accounts — daftar semua akun (khusus admin).
//
// listUsers() di db.js sudah memetakan baris lewat toUser() yang TIDAK
// menyertakan pin_hash, jadi tidak ada jalur yang bisa membocorkan hash PIN.
export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  return json({ accounts: listUsers() }, 200)
}

// POST /api/auth/accounts — buat akun (khusus admin), termasuk peran admin.
//
// Inilah satu-satunya pintu untuk membuat akun admin: pendaftaran publik
// (POST /api/auth/register) menolak peran `admin`. Karena itu endpoint ini
// digerbangi requireAdmin — hanya admin yang sudah ada yang bisa menambah
// admin baru, sehingga tidak ada jalur "naik pangkat" tanpa otorisasi.
export async function POST(request) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { allowed, retryAfter } = consume(
    `admin-account:${auth.user.id}:${clientIp(request)}`,
    LIMITS.templateWrite.max,
    LIMITS.templateWrite.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak permintaan. Coba lagi sebentar lagi.", 429, {
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

  const validationError = validateAccount({ name, pin, role, kelas })
  if (validationError) return jsonError(validationError, 400)

  let created
  try {
    created = createUser({
      name,
      role,
      kelas: role === "siswa" ? kelas : null,
      pinHash: hashPin(pin),
    })
  } catch {
    return jsonError("Nama itu sudah dipakai. Pilih nama lain.", 409)
  }

  return json({ ok: true, user: created.user }, 201)
}
