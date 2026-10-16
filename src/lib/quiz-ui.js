// ═══════════════════════════════════════════════════════════════════════════
// QUIZ UI — konstanta & helper tampilan yang dipakai banyak komponen
// ═══════════════════════════════════════════════════════════════════════════
// Modul murni tanpa dependensi React/Node: aman diimpor server maupun klien.
// Tujuannya menghapus salinan yang sebelumnya tersebar di 7+ berkas (setiap
// salinan bisa menyimpang saat jumlah opsi berubah).
// ═══════════════════════════════════════════════════════════════════════════

import { OPTION_COUNT } from "./quiz-validate.js"

/** Label huruf untuk tiap opsi: A, B, C, D (sepanjang OPTION_COUNT). */
export const OPTION_LETTERS = Array.from({ length: OPTION_COUNT }, (_, index) =>
  String.fromCharCode(65 + index)
)

/**
 * Format detik menjadi "m:ss" (untuk timer total kuis).
 * @param {number|null|undefined} seconds
 */
export function formatClock(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "0:00"
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${minutes}:${String(rest).padStart(2, "0")}`
}
