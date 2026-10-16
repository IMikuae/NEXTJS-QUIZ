// ═══════════════════════════════════════════════════════════════════════════
// HOST ACTIONS — rate limit bersama untuk aksi host
// ═══════════════════════════════════════════════════════════════════════════
// Aksi host (start/next/skip/advance/end/lock/kick/restart/extend) semuanya
// menuntut token host dan hanya dipicu tekanan tombol. Sebelum modul ini, satu-
// satunya penjaga di route-nya adalah "token host wajib dikirim"; aksi yang
// token-nya salah tidak pernah dihitung, sehingga sebuah kode room bisa
// dibanjiri percobaan tanpa hambatan.
//
// Kunci limit SENGAJA dibagi per IP (bukan per aksi): 120 aksi/menit jauh di
// atas pemakaian wajar seorang host, tapi cukup untuk membendung skrip.
// ═══════════════════════════════════════════════════════════════════════════

import { LIMITS, clientIp, consume, jsonError } from "./http"

/**
 * Batasi laju aksi host. Panggil di awal POST sebelum membaca body.
 *
 * @returns {Response|null} Response 429 bila melebihi batas, atau null (lanjut).
 */
export function throttleHostAction(request) {
  const { allowed, retryAfter } = consume(
    `host:${clientIp(request)}`,
    LIMITS.hostAction.max,
    LIMITS.hostAction.windowMs
  )
  if (allowed) return null
  return jsonError("Terlalu banyak aksi host. Coba lagi sebentar lagi.", 429, {
    "Retry-After": String(retryAfter),
  })
}
