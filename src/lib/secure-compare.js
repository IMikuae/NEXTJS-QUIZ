// ═══════════════════════════════════════════════════════════════════════════
// SECURE COMPARE — perbandingan string waktu-konstan
// ═══════════════════════════════════════════════════════════════════════════
// Token host/pemain dibandingkan dengan `timingSafeEqual` dari node:crypto.
// Perbandingan `===` biasa berhenti pada byte pertama yang beda, sehingga
// jumlah byte yang cocok (secara teori) bocor lewat waktu eksekusi. Token di
// sini 128-bit acak dan tidak dikirim ulang ke klien, jadi risikonya kecil —
// tapi ini pertahanan berlapis yang murah dan tidak punya sisi negatif.
//
// Modul ini Node-only (`node:crypto`); middleware/Edge tidak boleh memakainya.
// ═══════════════════════════════════════════════════════════════════════════

import { timingSafeEqual } from "node:crypto"

/**
 * Bandingkan dua string dalam waktu yang (nyaris) konstan.
 *
 * Panjang yang berbeda mengembalikan false lebih awal — itu disengaja: token
 * aplikasi ini berformat tetap (32 karakter hex), jadi panjang bukan rahasia.
 * Perbandingan byte tetap memakai `timingSafeEqual` yang menuntut panjang
 * buffer sama.
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false
  const left = Buffer.from(a, "utf8")
  const right = Buffer.from(b, "utf8")
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
