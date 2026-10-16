import { json } from "@/lib/http"
import { roomCount } from "@/lib/quiz-store"

// Menyentuh quiz-store (→ db) → runtime Node.
export const runtime = "nodejs"

// GET /api/health — pemeriksaan kesiapan sederhana untuk load balancer / uptime
// monitor. Sengaja TIDAK membocorkan detail internal (jumlah akun, path DB).
export async function GET() {
  return json(
    {
      ok: true,
      uptimeSec: Math.round(process.uptime()),
      rooms: roomCount(),
    },
    200,
    { "Cache-Control": "no-store" }
  )
}
