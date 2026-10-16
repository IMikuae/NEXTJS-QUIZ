// ═══════════════════════════════════════════════════════════════════════════
// QUIZ CRYPTO — pembangkit kode/token & util acak
// ═══════════════════════════════════════════════════════════════════════════
// Modul murni: hanya memakai Web Crypto (globalThis.crypto) yang tersedia di
// Node 20+ maupun runtime Edge. Tidak menyentuh state room, DB, atau apa pun.
// Dipisah dari quiz-store.js supaya mesin room tidak lagi memuat detail
// pembangkitan acak.
// ═══════════════════════════════════════════════════════════════════════════

const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

/** 6 huruf besar acak, mis. "KQZRMA". Dipakai sebagai kode room. */
export function randomCode(length = 6) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ""
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return out
}

/** 32 karakter hex acak (16 byte entropi) untuk token host / token pemain. */
export function randomToken() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Bilangan bulat acak 0..max-1 TANPA bias modulo.
 *
 * `byte % max` bias (nilai kecil lebih sering muncul) — untuk pengundian waktu
 * soal bias itu tidak berbahaya, tapi untuk pengacakan urutan soal/opsi
 * distribusi yang bias membuat urutan tertentu lebih sering muncul. Rejection
 * sampling menghilangkan bias dengan membuang hasil di atas kelipatan terbesar.
 */
export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 1) return 0
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  let value = 0
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % max
}

/** Salinan array yang sudah diacak (Fisher–Yates). Input TIDAK diubah. */
export function shuffled(array) {
  const copy = [...array]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

/** Normalisasi kode room: selalu uppercase supaya pencarian case-insensitive. */
export function normalizeCode(code) {
  return String(code ?? "").trim().toUpperCase()
}
