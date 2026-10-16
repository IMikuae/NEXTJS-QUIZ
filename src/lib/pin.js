// ═══════════════════════════════════════════════════════════════════════════
// PIN — hashing PIN dengan scrypt (modul murni, tanpa dependensi internal)
// ═══════════════════════════════════════════════════════════════════════════
// Dipisah dari auth.js dengan sengaja. Alasannya konkret:
//
//   db.js perlu hashPin untuk men-seed akun demo, dan auth.js perlu db.js
//   untuk tabel sesi. Kalau hashPin tinggal di auth.js, keduanya jadi saling
//   mengimpor. Siklus seperti itu berbahaya: hasilnya bergantung pada urutan
//   evaluasi modul, dan `import { hashPin } from "./auth"` di dalam db.js bisa
//   berakhir dengan binding yang belum terinisialisasi (TDZ) saat seed berjalan
//   di tengah evaluasi body modul.
//
// Dengan memindahkan kriptografi PIN ke modul tanpa dependensi apa pun,
// arah impornya jadi satu arah: auth → db → pin. Tidak ada siklus, tidak ada
// urutan yang perlu dijaga, dan modul ini bisa diuji Node biasa tanpa Next.
//
// Pola hashing mengikuti proyek saudara `shorturl/src/lib/auth.js`:
// scryptSync(PIN, salt, 64), disimpan "<saltHex>:<hashHex>", dibandingkan
// dengan timingSafeEqual — bukan `===`.
// ═══════════════════════════════════════════════════════════════════════════

import crypto from "node:crypto"

/** Panjang hash (byte) — sama dengan shorturl. */
const HASH_BYTES = 64
/** Panjang salt (byte). */
const SALT_BYTES = 16

/**
 * Hash PIN dengan salt acak.
 *
 * @param {string} pin
 * @returns {string} "<saltHex>:<hashHex>"
 */
export function hashPin(pin) {
  const salt = crypto.randomBytes(SALT_BYTES).toString("hex")
  const hash = crypto.scryptSync(String(pin), salt, HASH_BYTES).toString("hex")
  return `${salt}:${hash}`
}

/**
 * Verifikasi PIN terhadap hash tersimpan.
 *
 * Panjang hash diambil dari nilai TERSIMPAN (bukan konstanta), supaya akun
 * lama dengan panjang hash berbeda tetap bisa diverifikasi.
 *
 * @param {string} pin
 * @param {string} stored — "<saltHex>:<hashHex>"
 * @returns {boolean}
 */
export function verifyPin(pin, stored) {
  if (typeof stored !== "string") return false

  const separator = stored.indexOf(":")
  if (separator <= 0) return false

  const salt = stored.slice(0, separator)
  const expectedHex = stored.slice(separator + 1)
  if (!salt || !expectedHex) return false

  const expected = Buffer.from(expectedHex, "hex")
  if (expected.length === 0) return false

  const candidate = crypto.scryptSync(String(pin), salt, expected.length)
  // timingSafeEqual melempar bila panjang berbeda — sudah disamakan di atas,
  // tapi tetap dijaga supaya tidak pernah jadi 500.
  if (candidate.length !== expected.length) return false
  return crypto.timingSafeEqual(candidate, expected)
}
