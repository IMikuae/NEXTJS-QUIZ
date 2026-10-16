"use client"

// ═══════════════════════════════════════════════════════════════════════════
// AUTH STORE — akun & peran Yue Quiz (guru / siswa / admin)
// ═══════════════════════════════════════════════════════════════════════════
// SEJAK v2 backendnya adalah SERVER (CONTRACT §3):
//
//   POST   /api/auth/register        daftar + langsung masuk
//   POST   /api/auth/login           masuk
//   POST   /api/auth/logout          keluar
//   GET    /api/auth/me              siapa yang sedang masuk (opsional auth)
//   PATCH  /api/auth/me              ganti nama
//   POST   /api/auth/pin             ganti PIN
//   GET    /api/auth/accounts        daftar akun (khusus admin)
//   DELETE /api/auth/accounts/[id]   hapus akun (khusus admin)
//
// Yang berubah dari versi lama: PIN TIDAK LAGI di-hash di browser dan tidak
// ada akun yang disimpan di localStorage. Verifikasi PIN, cookie sesi
// (`yq_session`, httpOnly), dan peran semuanya urusan server. Browser hanya
// menahan hasil `GET /api/auth/me` di memori proses ini.
//
// Bentuk ekspor dipertahankan supaya halaman lain tidak perlu tahu backendnya
// pindah:
//   useAuth(), currentOwnerId(), getAuthSnapshot(), ROLES, ROLE_MAP,
//   PIN_LENGTH, KELAS_OPTIONS, DEMO_PIN_HINT, register, login, logout,
//   listPublicAccounts, deleteAccount, accountCount
//
// TAMBAHAN yang tidak ada di versi lama:
//   updateProfile(name), changePin(currentPin, newPin), refreshAccountCount(),
//   fetchAccounts(), DEMO_ACCOUNT_NAMES, REFRESH_EVENT
//
// CATATAN JUJUR: `listPublicAccounts()` dan `accountCount()` dulu membaca
// localStorage dan karenanya sinkron & selalu akurat. Sekarang daftar akun ada
// di server dan endpoint-nya KHUSUS ADMIN, jadi keduanya mengembalikan CACHE
// (hasil panggilan terakhir) — bukan kebenaran yang dijamin. Pemakaiannya:
//   • AdminClient → await fetchAccounts() (async, admin) sebelum menampilkan
//   • MasukClient → accountCount() untuk memutuskan petunjuk PIN demo
// Detail keputusan ini ada di CONTRACT-DEVIATIONS.md bagian "UI".
// ═══════════════════════════════════════════════════════════════════════════

import { useSyncExternalStore } from "react"
import { MAX_NAME_LEN } from "./quiz-validate"

/** ID pemilik data untuk pengunjung yang belum masuk. Dipakai quiz-storage. */
export const GUEST_OWNER_ID = "tamu"

export const ROLES = [
  { id: "guru", label: "Guru", desc: "Membuat kuis, mengelola kelas, melihat laporan." },
  { id: "siswa", label: "Siswa", desc: "Mengikuti kuis dan melihat nilai sendiri." },
  { id: "admin", label: "Admin", desc: "Mengelola akun & template di server." },
]

export const ROLE_MAP = Object.fromEntries(ROLES.map((role) => [role.id, role]))

/**
 * Peran yang boleh dipilih saat MENDAFTAR sendiri. `admin` sengaja tidak ada:
 * akun admin hanya bisa dibuat admin lain lewat panel admin. Ini cermin dari
 * PUBLIC_ROLES di src/lib/auth.js (server) — daftar yang sama, dua sisi.
 */
export const PUBLIC_ROLES = ROLES.filter((role) => role.id !== "admin")

/** PIN: tepat 6 digit angka (konsisten dengan keypad di halaman masuk). */
export const PIN_LENGTH = 6

/** Nama akun: 2–20 karakter (sama dengan batas server, lihat quiz-validate). */
export const MIN_NAME_LEN = 2
export const NAME_MAX_LEN = MAX_NAME_LEN

/** Kelas yang bisa dipilih siswa. */
export const KELAS_OPTIONS = ["7A", "7B", "8A", "8B", "9A", "9B"]

/**
 * Akun demo yang di-seed server SEKALI saat tabel `users` masih kosong
 * (CONTRACT §2). PIN semuanya 123456. Daftar nama ini dipakai halaman masuk
 * untuk menawarkan isi-cepat — bukan untuk membuat akun di browser.
 */
export const DEMO_ACCOUNT_NAMES = ["Admin Yue", "Bu Rina", "Budi", "Sari"]
export const DEMO_PIN_HINT = "123456"

// ─── Snapshot (useSyncExternalStore) ───────────────────────────────────────

let snapshot = { user: null, loaded: false }
const listeners = new Set()

/** Snapshot SSR — selalu "belum login" agar markup server & klien identik. */
const SERVER_SNAPSHOT = { user: null, loaded: false }

let bootstrapPromise = null
let accountsCache = []
let accountCountCache = null

function emit() {
  snapshot = { ...snapshot }
  for (const listener of listeners) listener()
}

function setSnapshot(next) {
  snapshot = next
  emit()
}

function subscribe(listener) {
  // Dipanggil dari subscribe (bukan saat render): hanya jalan di klien setelah
  // mount, jadi render hidrasi pertama tetap "belum login".
  ensureBootstrapped()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// getSnapshot harus MURNI — memuat sesi di sini bisa memicu loop render.
function getSnapshot() {
  return snapshot
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT
}

// ─── Panggilan API ─────────────────────────────────────────────────────────

/**
 * Pemanggil fetch internal. Sengaja tidak memakai postJson milik room-client
 * supaya tidak ada ketergantungan melingkar (room-client mengimpor modul ini).
 *
 * @returns {Promise<{ ok: boolean, status: number, data: any, error: string|null }>}
 */
async function apiRequest(path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    const error =
      typeof data?.error === "string" && data.error.length > 0 ? data.error : null

    return { ok: response.ok, status: response.status, data, error }
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "Tidak bisa menghubungi server. Periksa koneksimu.",
    }
  }
}

/** Bentuk User yang dipakai UI: id selalu string, kelas selalu null/string. */
function normalizeUser(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    role: String(raw.role ?? ""),
    kelas: raw.kelas ?? null,
    createdAt: raw.createdAt ?? null,
  }
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────

/**
 * Baca sesi sekali per muat halaman lewat `GET /api/auth/me`.
 *
 * Cookie `yq_session` httpOnly, jadi JavaScript TIDAK bisa tahu ada sesi atau
 * tidak tanpa bertanya ke server — inilah satu-satunya sumber kebenaran.
 * Panggilan ini juga menjadi pemicu paling awal untuk memuat sesi; hasilnya
 * disimpan di snapshot dan dipakai semua halaman.
 */
function ensureBootstrapped() {
  if (bootstrapPromise || typeof window === "undefined") return bootstrapPromise

  bootstrapPromise = apiRequest("/api/auth/me").then((result) => {
    if (result.ok) {
      const raw = result.data?.user ?? null
      // Toleran: kalau server juga mengirim ringkasan lain, pakai bila ada.
      if (typeof result.data?.accountCount === "number") {
        accountCountCache = result.data.accountCount
      }
      setSnapshot({ user: normalizeUser(raw), loaded: true })
      return
    }
    // Server tidak terjangkau / membalas error: perlakukan sebagai tamu supaya
    // halaman tidak menggantung di status "memuat" selamanya. Panggilan
    // berikutnya (setelah login) akan memperbaikinya.
    setSnapshot({ user: null, loaded: true })
  })

  return bootstrapPromise
}

/** Muat ulang identitas dari server (dipanggil setelah login/logout/ganti nama). */
export function refreshAuth() {
  bootstrapPromise = null
  setSnapshot({ user: snapshot.user, loaded: false })
  return ensureBootstrapped() ?? Promise.resolve()
}

// ─── API publik ────────────────────────────────────────────────────────────

/** ID pemilik data saat ini — "tamu" bila belum login. Dipakai quiz-storage. */
export function currentOwnerId() {
  ensureBootstrapped()
  return snapshot.user?.id ?? GUEST_OWNER_ID
}

/** @returns {{ user: object|null, loaded: boolean }} */
export function getAuthSnapshot() {
  ensureBootstrapped()
  return snapshot
}

/** Hook React — komponen ikut re-render saat login/logout/ganti akun. */
export function useAuth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return state.loaded ? state : { user: null, loaded: false }
}

// ─── Validasi sisi klien (cermin aturan server, CONTRACT §3) ────────────────

function normalizeName(name) {
  return String(name ?? "").trim()
}

function normalizePin(pin) {
  return String(pin ?? "").replace(/\D/g, "").slice(0, PIN_LENGTH)
}

/**
 * Validasi daftar yang SAMA dengan server. Mengembalikan pesan dalam bahasa
 * Indonesia yang siap ditampilkan, atau null bila lolos.
 */
function checkRegistration({ name, pin, role, kelas }) {
  if (name.length < MIN_NAME_LEN) return `Nama minimal ${MIN_NAME_LEN} karakter.`
  if (name.length > NAME_MAX_LEN) return `Nama maksimal ${NAME_MAX_LEN} karakter.`
  if (pin.length !== PIN_LENGTH) return `PIN harus tepat ${PIN_LENGTH} digit angka.`
  if (!ROLE_MAP[role]) return "Pilih peran dulu (guru / siswa / admin)."
  if (role === "siswa" && !KELAS_OPTIONS.includes(kelas)) return "Siswa wajib memilih kelas."
  return null
}

// ─── Daftar / masuk / keluar ───────────────────────────────────────────────

/**
 * Daftar akun baru di server + langsung masuk (server menyetel cookie sesi).
 * @param {{ name: string, pin: string, role: string, kelas?: string|null }} input
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string }>}
 */
export async function register({ name, pin, role, kelas }) {
  const cleanName = normalizeName(name)
  const cleanPin = normalizePin(pin)

  const problem = checkRegistration({ name: cleanName, pin: cleanPin, role, kelas })
  if (problem) return { ok: false, error: problem }

  const result = await apiRequest("/api/auth/register", {
    method: "POST",
    body: {
      name: cleanName,
      pin: cleanPin,
      role,
      kelas: role === "siswa" ? kelas : null,
    },
  })

  if (!result.ok) {
    return { ok: false, error: result.error || "Pendaftaran gagal. Coba lagi." }
  }

  const user = normalizeUser(result.data?.user)
  if (!user) {
    return { ok: false, error: "Server tidak mengirim data akun. Coba masuk kembali." }
  }

  accountCountCache = null
  setSnapshot({ user, loaded: true })
  return { ok: true, user }
}

/**
 * Masuk dengan nama + PIN.
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string }>}
 */
export async function login({ name, pin }) {
  const cleanName = normalizeName(name)
  const cleanPin = normalizePin(pin)

  if (cleanName.length === 0) return { ok: false, error: "Isi nama akunmu dulu." }
  if (cleanPin.length !== PIN_LENGTH) {
    return { ok: false, error: `PIN harus ${PIN_LENGTH} digit angka.` }
  }

  const result = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { name: cleanName, pin: cleanPin },
  })

  if (!result.ok) {
    // Pesan server ("Nama atau PIN tidak cocok.") ditampilkan APA ADANYA.
    return { ok: false, error: result.error || "Masuk gagal. Coba lagi." }
  }

  const user = normalizeUser(result.data?.user)
  if (!user) {
    return { ok: false, error: "Server tidak mengirim data akun. Coba masuk kembali." }
  }

  setSnapshot({ user, loaded: true })
  return { ok: true, user }
}

/**
 * Keluar dari akun. Snapshot lokal langsung dibersihkan (supaya UI dan
 * pemanggil lama yang tidak meng-await tetap benar), lalu cookie sesi
 * dihapus di server.
 * @returns {Promise<{ ok: boolean }>}
 */
export function logout() {
  setSnapshot({ user: null, loaded: true })
  accountsCache = []
  accountCountCache = null
  return apiRequest("/api/auth/logout", { method: "POST" }).then((result) => ({
    ok: result.ok,
  }))
}

// ─── Profil & PIN ──────────────────────────────────────────────────────────

/**
 * Ganti nama tampilan akun yang sedang masuk.
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string }>}
 */
export async function updateProfile(name) {
  const cleanName = normalizeName(name)
  if (cleanName.length < MIN_NAME_LEN) {
    return { ok: false, error: `Nama minimal ${MIN_NAME_LEN} karakter.` }
  }
  if (cleanName.length > NAME_MAX_LEN) {
    return { ok: false, error: `Nama maksimal ${NAME_MAX_LEN} karakter.` }
  }

  const result = await apiRequest("/api/auth/me", {
    method: "PATCH",
    body: { name: cleanName },
  })

  if (!result.ok) return { ok: false, error: result.error || "Gagal menyimpan nama." }

  const user = normalizeUser(result.data?.user)
  if (!user) return { ok: false, error: "Server tidak mengirim data akun." }

  setSnapshot({ user, loaded: true })
  return { ok: true, user }
}

/**
 * Ganti PIN. Server menolak bila PIN baru sama dengan yang lama.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function changePin(currentPin, newPin) {
  const current = normalizePin(currentPin)
  const next = normalizePin(newPin)

  if (current.length !== PIN_LENGTH) {
    return { ok: false, error: `PIN lama harus ${PIN_LENGTH} digit angka.` }
  }
  if (next.length !== PIN_LENGTH) {
    return { ok: false, error: `PIN baru harus ${PIN_LENGTH} digit angka.` }
  }
  if (current === next) {
    return { ok: false, error: "PIN baru tidak boleh sama dengan PIN lama." }
  }

  const result = await apiRequest("/api/auth/pin", {
    method: "POST",
    body: { currentPin: current, newPin: next },
  })

  if (!result.ok) return { ok: false, error: result.error || "Gagal mengganti PIN." }
  return { ok: true }
}

// ─── Daftar akun (khusus admin) ────────────────────────────────────────────

/**
 * Muat daftar akun dari server. Hanya berhasil untuk peran admin;
 * pemanggil non-admin menerima `{ ok: false, error }` (server membalas 403).
 * Hasilnya di-cache supaya listPublicAccounts()/accountCount() tetap sinkron.
 *
 * @returns {Promise<{ ok: boolean, accounts?: Array, accountCount?: number, error?: string }>}
 */
export async function fetchAccounts() {
  const result = await apiRequest("/api/auth/accounts")
  if (!result.ok) {
    return { ok: false, error: result.error || "Daftar akun tidak bisa dibaca." }
  }

  const raw = Array.isArray(result.data?.accounts) ? result.data.accounts : []
  accountsCache = raw.map(normalizeUser).filter(Boolean).sort(byName)
  accountCountCache = accountsCache.length

  return { ok: true, accounts: accountsCache, accountCount: accountsCache.length }
}

function byName(a, b) {
  return a.name.localeCompare(b.name, "id")
}

/**
 * Buat akun baru dari panel admin (khusus admin). Berbeda dari `register`:
 *   • TIDAK mengubah sesi yang sedang aktif (admin tetap masuk sebagai dirinya),
 *   • MENERIMA peran admin — inilah satu-satunya jalur membuat admin baru.
 *
 * @returns {Promise<{ ok: true, user: object } | { ok: false, error: string }>}
 */
export async function createAccount({ name, pin, role, kelas }) {
  ensureBootstrapped()
  const cleanName = normalizeName(name)
  const cleanPin = normalizePin(pin)

  const problem = checkRegistration({ name: cleanName, pin: cleanPin, role, kelas })
  if (problem) return { ok: false, error: problem }

  const result = await apiRequest("/api/auth/accounts", {
    method: "POST",
    body: {
      name: cleanName,
      pin: cleanPin,
      role,
      kelas: role === "siswa" ? kelas : null,
    },
  })

  if (!result.ok) {
    return { ok: false, error: result.error || "Akun gagal dibuat. Coba lagi." }
  }

  const user = normalizeUser(result.data?.user)
  if (!user) {
    return { ok: false, error: "Server tidak mengirim data akun." }
  }

  accountsCache = [...accountsCache, user].sort(byName)
  accountCountCache = accountsCache.length
  return { ok: true, user }
}

/**
 * Jumlah akun yang DIKETAHUI klien ini. Angka 0 berarti "belum tahu / tidak
 * ada" — lihat catatan jujur di kepala file: daftar akun hanya bisa dibaca
 * admin, jadi untuk tamu angkanya tetap 0 sampai ada sumber lain.
 */
export function accountCount() {
  ensureBootstrapped()
  return accountCountCache ?? 0
}

/**
 * Daftar akun dari cache terakhir (tanpa hash — aman untuk panel admin).
 * Untuk data terbaru, panggil `await fetchAccounts()` lebih dulu.
 */
export function listPublicAccounts() {
  ensureBootstrapped()
  return [...accountsCache]
}

/**
 * Hapus akun (khusus admin). Server menolak menghapus akun yang sedang aktif.
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function deleteAccount(userId) {
  ensureBootstrapped()
  if (snapshot.user && String(snapshot.user.id) === String(userId)) {
    return { ok: false, error: "Kamu sedang memakai akun ini. Keluar dulu." }
  }

  const result = await apiRequest(`/api/auth/accounts/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  })
  if (!result.ok) return { ok: false, error: result.error || "Gagal menghapus akun." }

  accountsCache = accountsCache.filter((account) => account.id !== String(userId))
  accountCountCache = accountsCache.length
  return { ok: true }
}
