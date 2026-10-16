import { requireUser } from "@/lib/auth"
import { deleteArchivedRoom, getArchivedRoom } from "@/lib/db"
import { json, jsonError } from "@/lib/http"

// Membaca/menghapus SQLite → wajib runtime Node.
export const runtime = "nodejs"

/** Boleh membaca/menghapus arsip ini? admin selalu boleh; lainnya hanya miliknya. */
function canAccess(user, row) {
  if (!row) return false
  if (user.role === "admin") return true
  return row.hostUser === user.id
}

// GET /api/rooms/archive/[code] — detail satu sesi (termasuk rekap per soal).
export async function GET(request, { params }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { code } = await params
  const row = getArchivedRoom(String(code).trim().toUpperCase())
  if (!canAccess(auth.user, row)) {
    // 404, bukan 403: jangan mengonfirmasi keberadaan arsip milik orang lain.
    return jsonError("Riwayat sesi tidak ditemukan.", 404)
  }

  return json({ session: row }, 200)
}

// DELETE /api/rooms/archive/[code] — hapus satu arsip.
export async function DELETE(request, { params }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { code } = await params
  const clean = String(code).trim().toUpperCase()
  const row = getArchivedRoom(clean)
  if (!canAccess(auth.user, row)) {
    return jsonError("Riwayat sesi tidak ditemukan.", 404)
  }

  const removed =
    auth.user.role === "admin"
      ? deleteArchivedRoom(clean)
      : deleteArchivedRoom(clean, auth.user.id)

  if (!removed) {
    return jsonError("Riwayat sesi tidak ditemukan.", 404)
  }

  return json({ ok: true }, 200)
}
