import { getAuthUser, requireUser, renameUser, validateName } from "@/lib/auth"
import { findUserByName } from "@/lib/db"
import { json, jsonError, readJsonBody } from "@/lib/http"

// Route ini menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// GET /api/auth/me — siapa yang sedang masuk.
//
// `user: null` (bukan 401) bila belum masuk: ini yang dipanggil klien pertama
// kali untuk memutuskan tampilan, dan 401 akan memaksa setiap pemanggil
// menangani "error" yang sebenarnya keadaan normal.
export async function GET() {
  const user = await getAuthUser()
  return json({ user: user ?? null }, 200)
}

// PATCH /api/auth/me — ganti nama akun sendiri.
//
// Penjaga login memakai requireUser() dari auth.js; bentuk { ok, response }
// dipilih supaya route cukup menulis `if (!auth.ok) return auth.response`.
export async function PATCH(request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const body = await readJsonBody(request)
  if (!body.ok) return body.response

  const name = typeof body.data?.name === "string" ? body.data.name.trim() : body.data?.name

  const validationError = validateName(name)
  if (validationError) return jsonError(validationError, 400)

  const existing = findUserByName(name)
  if (existing && existing.id !== auth.user.id) {
    return jsonError("Nama itu sudah dipakai. Pilih nama lain.", 409)
  }

  renameUser(auth.user.id, name)

  return json({ ok: true, user: { ...auth.user, name } }, 200)
}
