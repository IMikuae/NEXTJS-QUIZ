import { requireUser } from "@/lib/auth"
import { listArchivedRooms } from "@/lib/db"
import { json } from "@/lib/http"

// Membaca SQLite → wajib runtime Node.
export const runtime = "nodejs"

// GET /api/rooms/archive — riwayat sesi yang sudah berakhir.
//
// Otorisasi:
//   • admin  → semua arsip
//   • lainnya → hanya arsip milik akun sendiri (host_user = id)
//   • anonim → 401
//
// Ini menutup fitur yang sebelumnya setengah jadi: sesi diarsipkan sejak awal,
// tetapi tidak ada endpoint/UI yang membacanya.
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const hostFilter = auth.user.role === "admin" ? null : auth.user.id
  const rows = listArchivedRooms(hostFilter)

  return json(
    {
      sessions: rows.map((row) => ({
        code: row.code,
        title: row.title,
        mode: row.mode,
        playerCount: row.playerCount,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        averageGrade: row.summary?.results?.averageGrade ?? null,
        perPlayer: row.summary?.results?.perPlayer?.length ?? 0,
        // Ringkasan per soal tidak dikirim di daftar (payload besar);
        // halaman detail memuatnya.
      })),
      total: rows.length,
    },
    200
  )
}
