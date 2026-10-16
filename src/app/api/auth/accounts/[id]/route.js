import { requireAdmin } from "@/lib/auth"
import { deleteUser, findUserById } from "@/lib/db"
import { json, jsonError } from "@/lib/http"

// Route ini menyentuh SQLite → wajib runtime Node.
export const runtime = "nodejs"

// DELETE /api/auth/accounts/[id] — hapus akun (khusus admin).
//
// Dua penjaga yang disengaja:
//   1. admin TIDAK boleh menghapus akunnya sendiri — kalau boleh, satu klik
//      salah bisa menghilangkan satu-satunya akun admin dan halaman admin
//      jadi tidak bisa diakses lagi;
//   2. id harus berupa angka dan benar-benar ada.
export async function DELETE(request, { params }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return jsonError("Akun tidak ditemukan.", 404)
  }

  if (numericId === auth.user.id) {
    return jsonError("Kamu sedang memakai akun ini. Keluar dulu.", 400)
  }

  if (!findUserById(numericId)) {
    return jsonError("Akun tidak ditemukan.", 404)
  }

  deleteUser(numericId)

  return json({ ok: true }, 200)
}
