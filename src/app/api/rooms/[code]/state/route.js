import { LIMITS, clientIp, consume, json, jsonError } from "@/lib/http"
import { safeEqual } from "@/lib/secure-compare"
import { authenticatePlayer, closeExpiredQuestions, getRoom, pruneRooms, publicState } from "@/lib/quiz-store"

// quiz-store.js mengimpor db.js (untuk arsip sesi), jadi SETIAP route yang
// menyentuhnya berjalan di runtime Node — bukan Edge.
export const runtime = "nodejs"

// GET /api/rooms/{code}/state — sumber kebenaran tunggal untuk SEMUA klien.
//
// Dipanggil setiap detik oleh host maupun pemain (lihat pola polling di
// komponen klien). Dua hal WAJIB terjadi sebelum apa pun dibaca:
//   1. pruneRooms()             — buang room kedaluwarsa (memori tidak bocor)
//   2. closeExpiredQuestions()  — maju tanpa aksi host: mode live question →
//                                 reveal; mode exam pemain yang habis waktu
//                                 dicatat "tidak menjawab" lalu lanjut.
//
// Lalu respons dibangun lewat publicState() — TIDAK PERNAH objek room mentah.
// Lihat blok "ATURAN ANTI-CHEAT" di src/lib/quiz-store.js.
export async function GET(request, { params }) {
  pruneRooms()
  closeExpiredQuestions()

  const { code } = await params
  const room = getRoom(code)
  if (!room) {
    return jsonError("Room tidak ditemukan.", 404)
  }

  const url = new URL(request.url)
  const playerId = url.searchParams.get("playerId")
  const token = url.searchParams.get("token")
  const hostToken = request.headers.get("x-host-token")

  // ── Rate limit per identitas, bukan per IP ─────────────────────────────
  // Satu kelas biasanya berada di belakang NAT yang sama; membatasi per IP
  // akan memutus polling normal begitu ada banyak murid. Kunci dibedakan per
  // pemain/host, dan anonim dibatasi lebih ketat.
  let limitKey
  if (playerId && token) {
    limitKey = `state:p:${code}:${playerId}`
  } else if (hostToken) {
    limitKey = `state:h:${code}:${hostToken}`
  } else {
    limitKey = `state:a:${code}:${clientIp(request)}`
  }
  const budget = playerId && token ? LIMITS.state : { max: 240, windowMs: 60 * 1000 }
  const { allowed, retryAfter } = consume(limitKey, budget.max, budget.windowMs)
  if (!allowed) {
    return jsonError("Terlalu banyak permintaan. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  // ── Tentukan identitas penonton ─────────────────────────────────────────
  let viewer = null

  if (playerId && token) {
    const player = authenticatePlayer(room, playerId, token)
    if (!player) {
      return jsonError("Token pemain tidak valid.", 403)
    }
    viewer = { kind: "player", playerId: player.id }
  } else if (hostToken) {
    if (!safeEqual(hostToken, room.hostToken)) {
      return jsonError("Token host tidak valid.", 403)
    }
    viewer = { kind: "host" }
  }
  // Tanpa identitas (mis. halaman lobby yang baru dibuka) → viewer null:
  // state tetap boleh dibaca, tapi tanpa data pribadi siapa pun.

  return json(publicState(room, viewer), 200, { "Cache-Control": "no-store" })
}
