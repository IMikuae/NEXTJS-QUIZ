import { clearSessionCookie, getSessionToken, destroySession } from "@/lib/auth"
import { json } from "@/lib/http"

// Route ini menyentuh SQLite (menghapus baris sesi) → wajib runtime Node.
export const runtime = "nodejs"

// POST /api/auth/logout — cabut sesi + hapus cookie.
//
// Baris sesi benar-benar dihapus dari tabel `sessions`, bukan hanya cookienya
// dikosongkan: token yang sudah dicuri tetap tidak bisa dipakai lagi.
export async function POST() {
  const token = await getSessionToken()
  if (token) destroySession(token)
  await clearSessionCookie()
  return json({ ok: true }, 200)
}
