// ═══════════════════════════════════════════════════════════════════════════
// AUTH — hashing PIN + sesi cookie (server)
// ═══════════════════════════════════════════════════════════════════════════
// Mengikuti pola proyek saudara `shorturl/src/lib/auth.js`:
//   • scryptSync(PIN, salt, 64) — salt 16 byte acak per akun,
//   • disimpan sebagai "<saltHex>:<hashHex>",
//   • dibandingkan dengan timingSafeEqual (bukan ===),
//   • token sesi 32 byte hex acak di tabel `sessions`, bukan JWT — supaya
//     logout benar-benar mencabut akses (barisnya dihapus).
//
// File ini SENGAJA tidak memuat logika bisnis apa pun: hanya siklus hidup
// sesi, penjaga route, dan validator bersama. Semua route memakainya.
//
// KRIPTOGRAFI PIN TIDAK DI SINI — ada di `./pin.js`. Pemindahan itu disengaja
// untuk memutus siklus impor: db.js butuh hashPin (seed akun demo), sementara
// file ini butuh db.js (tabel sesi). Dengan hashPin di modul tanpa dependensi,
// arah impornya jadi satu arah (auth → db → pin) dan tidak ada urutan evaluasi
// modul yang perlu dijaga. hashPin/verifyPin tetap DIEKSPOR ULANG di bawah,
// jadi tidak ada route yang perlu tahu soal pemisahan ini.
// ═══════════════════════════════════════════════════════════════════════════

import crypto from "node:crypto"
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
  findUserById,
  findUserByName,
  getSessionUser as getSessionUserRow,
  pruneSessions,
  updateUserName,
} from "./db.js"
import { jsonError } from "./http.js"
import { hashPin, verifyPin } from "./pin.js"

// Re-export publik: bentuknya sama seperti sebelum dipisah.
export { hashPin, verifyPin }

export const AUTH_COOKIE = "yq_session"
const SESSION_TTL_DAYS = 30

/**
 * `cookies()` dari next/headers dimuat LAZIM, bukan lewat impor statis di
 * kepala berkas.
 *
 * Alasannya konkret: sub-path "next/headers" hanya bisa diselesaikan oleh
 * resolver Next.js, bukan oleh Node biasa. Dengan impor statis, modul ini
 * tidak bisa diimpor sama sekali di luar Next — termasuk oleh
 * `scripts/self-test.mjs`.
 *
 * Karena semua helper cookie di bawah sudah `async`, impor dinamis tidak
 * mengubah bentuk API-nya sedikit pun. Di runtime Next, hasilnya identik.
 */
async function cookieJar() {
  const { cookies } = await import("next/headers")
  return cookies()
}

/** Peran yang sah + kelas yang sah. Cermin dari src/lib/auth-store.js (klien). */
export const ROLES = ["guru", "siswa", "admin"]
/**
 * Peran yang boleh dipilih lewat registrasi PUBLIK. `admin` sengaja TIDAK ada
 * di sini: kalau admin bisa didaftarkan sendiri, seluruh otorisasi "khusus
 * admin" hanya jadi hiasan UI. Akun admin dibuat lewat endpoint terpisah yang
 * mewajibkan pemanggilnya sudah admin (POST /api/auth/accounts).
 */
export const PUBLIC_ROLES = ["guru", "siswa"]
export const KELAS_OPTIONS = ["7A", "7B", "8A", "8B", "9A", "9B"]
export const PIN_LENGTH = 6
export const NAME_MIN_LEN = 2
export const NAME_MAX_LEN = 20

// ═══════════════════════════════════════════════════════════════════════════
// SESI
// ═══════════════════════════════════════════════════════════════════════════

/** 32 byte hex acak — token sesi (lihat createSessionForUser di bawah). */
export function generateToken() {
  return crypto.randomBytes(32).toString("hex")
}

/**
 * Buat sesi baru untuk user.
 * @returns {string} token untuk cookie
 */
export function createSessionForUser(userId) {
  const token = generateToken()
  createSession(token, userId, SESSION_TTL_DAYS)
  return token
}

/** User dari token — null bila token kosong/tidak ada/kedaluwarsa. */
export function getSessionUser(token) {
  if (!token) return null
  return getSessionUserRow(token)
}

/** Cabut satu sesi (logout). */
export function destroySession(token) {
  if (token) deleteSession(token)
}

/** Cabut SEMUA sesi user — dipakai setelah ganti PIN. */
export function destroySessionsForUser(userId) {
  deleteSessionsForUser(userId)
}

/** Sapu sesi kedaluwarsa. Dipanggil lazy, bukan dari setInterval. */
export function pruneExpiredSessions() {
  pruneSessions()
}

/** Opsi cookie sesi — dipakai `cookieStore.set` maupun `delete`. */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_TTL_DAYS,
    secure: process.env.NODE_ENV === "production",
  }
}

/** Tulis cookie sesi. HANYA boleh dipanggil dari route handler / server action. */
export async function setSessionCookie(token) {
  const jar = await cookieJar()
  jar.set(AUTH_COOKIE, token, sessionCookieOptions())
}

/** Hapus cookie sesi. HANYA boleh dipanggil dari route handler / server action. */
export async function clearSessionCookie() {
  const jar = await cookieJar()
  // maxAge: 0 — beberapa browser mengabaikan `delete()` tanpa opsi yang sama.
  jar.set(AUTH_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 })
}

/** Token sesi dari cookie request (atau null). */
export async function getSessionToken() {
  const jar = await cookieJar()
  return jar.get(AUTH_COOKIE)?.value ?? null
}

/** User dari cookie request, atau null. Tidak melempar. */
export async function getAuthUser() {
  const token = await getSessionToken()
  return getSessionUser(token)
}

// ─── Penjaga route ─────────────────────────────────────────────────────────

/**
 * Wajib login.
 * @returns {{ ok: true, user: object } | { ok: false, response: Response }}
 *
 * Bentuk ini sengaja dipilih supaya route cukup menulis:
 *   const auth = await requireUser()
 *   if (!auth.ok) return auth.response
 */
export async function requireUser() {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false, response: jsonError("Kamu harus masuk dulu.", 401) }
  }
  return { ok: true, user }
}

/** Wajib login DENGAN peran admin. */
export async function requireAdmin() {
  const user = await getAuthUser()
  if (!user) {
    return { ok: false, response: jsonError("Kamu harus masuk dulu.", 401) }
  }
  if (user.role !== "admin") {
    return { ok: false, response: jsonError("Hanya admin yang boleh melakukan ini.", 403) }
  }
  return { ok: true, user }
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDASI BERSAMA (bentuk: string error atau null — sama seperti shorturl)
// ═══════════════════════════════════════════════════════════════════════════

/** Nama: 2–20 karakter. Keunikan TIDAK dicek di sini (butuh DB). */
export function validateName(name) {
  if (typeof name !== "string") return "Nama wajib diisi."
  const clean = name.trim()
  if (clean.length === 0) return "Nama wajib diisi."
  if (clean.length < NAME_MIN_LEN) return `Nama minimal ${NAME_MIN_LEN} karakter.`
  if (clean.length > NAME_MAX_LEN) return `Nama maksimal ${NAME_MAX_LEN} karakter.`
  return null
}

/** PIN: tepat 6 digit angka. */
export function validatePin(pin) {
  if (typeof pin !== "string" && typeof pin !== "number") return "PIN wajib diisi."
  const clean = String(pin).trim()
  if (clean.length === 0) return "PIN wajib diisi."
  if (!/^\d+$/.test(clean)) return "PIN hanya boleh berisi angka."
  if (clean.length !== PIN_LENGTH) return `PIN harus tepat ${PIN_LENGTH} digit angka.`
  return null
}

/** Peran: guru | siswa | admin. */
export function validateRole(role) {
  if (typeof role !== "string" || role.trim() === "") return "Pilih peran dulu (guru / siswa)."
  if (!ROLES.includes(role)) return "Peran harus salah satu dari guru, siswa, atau admin."
  return null
}

/**
 * Peran untuk registrasi publik: hanya guru | siswa.
 *
 * Dipisah dari `validateRole` supaya aturan "admin tidak boleh mendaftar
 * sendiri" ditegakkan di server (bukan cuma disembunyikan di UI) tanpa
 * mematikan validasi peran yang lebih luas di tempat lain.
 */
export function validatePublicRole(role) {
  if (typeof role !== "string" || role.trim() === "") return "Pilih peran dulu (guru / siswa)."
  if (!PUBLIC_ROLES.includes(role)) {
    return "Peran yang bisa dipilih hanya guru atau siswa."
  }
  return null
}

/** Kelas: wajib bila role siswa, harus salah satu dari daftar kelas. */
export function validateKelas(kelas, role) {
  if (role === "siswa") {
    if (typeof kelas !== "string" || kelas.trim() === "") return "Siswa wajib memilih kelas."
    if (!KELAS_OPTIONS.includes(kelas)) return "Kelas tidak dikenal."
    return null
  }
  // Non-siswa: kelas diabaikan (boleh null) — tapi kalau diisi harus sah.
  if (kelas === undefined || kelas === null || kelas === "") return null
  if (!KELAS_OPTIONS.includes(kelas)) return "Kelas tidak dikenal."
  return null
}

/** Validasi lengkap satu akun (register / ganti data). */
export function validateAccount({ name, pin, role, kelas }) {
  return (
    validateName(name) ||
    validatePin(pin) ||
    validateRole(role) ||
    validateKelas(kelas, role) ||
    null
  )
}

/** Validasi akun untuk registrasi publik — peran dibatasi guru/siswa. */
export function validatePublicAccount({ name, pin, role, kelas }) {
  return (
    validateName(name) ||
    validatePin(pin) ||
    validatePublicRole(role) ||
    validateKelas(kelas, role) ||
    null
  )
}

/** Cek ketersediaan nama (case-insensitive lewat COLLATE NOCASE di DB). */
export function nameTaken(name) {
  return Boolean(findUserByName(name))
}

/** Re-export kecil supaya route tidak perlu mengimpor db.js dua kali. */
export function findUser(id) {
  return findUserById(id)
}

export function renameUser(id, name) {
  return updateUserName(id, name)
}
