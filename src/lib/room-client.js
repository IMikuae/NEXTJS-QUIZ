"use client"

// ═══════════════════════════════════════════════════════════════════════════
// HOOK & UTIL KLIEN — dipakai bersama oleh HomeClient, HostClient, PlayClient
// ═══════════════════════════════════════════════════════════════════════════
// Dipisah ke modul sendiri supaya pola polling dan penyimpanan identitas
// IDENTIK di ketiga halaman — bukan hasil salin-tempel yang bisa menyimpang.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react"
import { useAuth } from "./auth-store"

/** Interval polling. 1 detik: cukup responsif, jauh lebih ringan dari WS. */
export const POLL_INTERVAL_MS = 1000

// ─── Penyimpanan identitas di sessionStorage ───────────────────────────────
//
// SENGAJA sessionStorage, BUKAN localStorage:
//   - localStorage dibagi ke SEMUA tab di origin yang sama. Kalau host membuka
//     tab kedua sebagai pemain, token host dan token pemain akan saling
//     menimpa — dan lebih buruk lagi, token host bisa terbaca dari tab pemain.
//   - sessionStorage terpisah per tab, jadi satu tab = satu peran. Refresh
//     halaman tetap mempertahankan identitas (yang kita butuhkan), tapi
//     membuka tab baru berarti mulai sebagai anonim (yang kita inginkan).
//   - Umurnya juga otomatis berakhir saat tab ditutup — tidak ada token yang
//     tertinggal di disk setelah pemain selesai bermain.

const PLAYER_KEY = (code) => `quiz:player:${code}`
const HOST_KEY = (code) => `quiz:host:${code}`

/** Baca JSON dari sessionStorage dengan aman (private mode bisa melempar). */
function readSession(key) {
  if (typeof window === "undefined") return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

/** Tulis JSON ke sessionStorage dengan aman. */
function writeSession(key, value) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Kuota penuh atau storage diblokir — permainan tetap jalan, hanya
    // identitas tidak bertahan saat refresh.
  }
}

/** Hapus satu kunci sessionStorage. */
function clearSession(key) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // abaikan
  }
}

/** Simpan identitas pemain untuk room `code`. */
export function savePlayer(code, playerId, token, name) {
  writeSession(PLAYER_KEY(code), { playerId, token, name })
}

/** Ambil identitas pemain untuk room `code` (atau null). */
export function loadPlayer(code) {
  return readSession(PLAYER_KEY(code))
}

/** Hapus identitas pemain (dipakai kalau token ditolak server). */
export function forgetPlayer(code) {
  clearSession(PLAYER_KEY(code))
}

/** Simpan token host untuk room `code`. */
export function saveHost(code, hostToken) {
  writeSession(HOST_KEY(code), { hostToken })
}

/** Ambil token host untuk room `code` (atau null). */
export function loadHost(code) {
  const data = readSession(HOST_KEY(code))
  return typeof data?.hostToken === "string" ? data.hostToken : null
}

/** Hapus token host. */
export function forgetHost(code) {
  clearSession(HOST_KEY(code))
}

// ─── Polling state room ────────────────────────────────────────────────────

/**
 * Polling `GET /api/rooms/{code}/state` setiap 1 detik.
 *
 * Kunci efisiensinya: server mengirim `version` (naik SETIAP kali state
 * berubah). Kita hanya memanggil `setState` kalau `version` BERUBAH — jadi
 * React tidak di-render ulang 60x/menit hanya karena ada 60 respons identik.
 * Tanpa ini, setiap respons baru akan membuat objek state baru dan memicu
 * re-render seluruh pohon komponen setiap detik, yang terasa berat di HP.
 *
 * @param {string} code                 kode room
 * @param {{ playerId?: string, token?: string, hostToken?: string }} auth
 * @param {{ onNotFound?: () => void, onForbidden?: () => void, enabled?: boolean }} [handlers]
 *   `enabled: false` menahan polling sampai identitas selesai dibaca dari
 *   sessionStorage — tanpa itu, tick pertama akan berjalan tanpa token dan
 *   ditolak 403, yang bisa salah diartikan sebagai token tidak valid.
 * @returns {{ state: object|null, status: string, refresh: () => void,
 *            connection: "ok"|"down" }}
 *   status: "loading" | "ready" | "not_found" | "forbidden" | "error"
 *   connection: kesehatan jaringan polling — "down" bila ≥2 fetch gagal
 *   berurutan; state lama tetap tersaji saat "down" (UI tidak blank).
 */
export function useRoomState(code, auth, handlers = {}) {
  const [state, setState] = useState(null)
  const [status, setStatus] = useState("loading")
  const [connection, setConnection] = useState("ok")

  const enabled = handlers.enabled !== false

  // Handler & identitas disimpan di ref supaya perubahan identitas objek tidak
  // memicu ulang effect polling (yang akan me-reset interval terus-menerus).
  //
  // Ditulis di EFFECT, bukan saat render: menulis ref selama render melanggar
  // aturan React (render harus murni) dan berbahaya di Concurrent Rendering —
  // nilai bisa berasal dari render yang dibatalkan. Effect berjalan setelah
  // commit, jadi ref selalu berisi nilai commit terakhir saat tick berikutnya.
  const handlersRef = useRef(handlers)
  const authRef = useRef(auth)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])
  useEffect(() => {
    authRef.current = auth
  }, [auth])

  const lastVersionRef = useRef(-1)
  const cancelledRef = useRef(false)
  // Penghitung kegagalan jaringan BERURUTAN. Satu gagal belum tentu putus
  // (paket hilang); dua berurutan → tampilkan "koneksi bermasalah".
  const netFailRef = useRef(0)

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams()
    const { playerId, token } = authRef.current || {}
    if (playerId && token) {
      params.set("playerId", playerId)
      params.set("token", token)
    }
    const query = params.toString()
    return `/api/rooms/${encodeURIComponent(code)}/state${query ? `?${query}` : ""}`
  }, [code])

  const tick = useCallback(async () => {
    const headers = {}
    const hostToken = authRef.current?.hostToken
    if (hostToken) headers["X-Host-Token"] = hostToken

    let response
    try {
      response = await fetch(buildUrl(), { cache: "no-store", headers })
    } catch {
      // Jaringan putus — JANGAN diamlkan begitu saja: tandai "down" setelah
      // 2 kegagalan berurutan. UI lama tetap tampil (state tidak di-reset);
      // ConnectionPill yang menampilkan statusnya. Tick berikutnya mencoba lagi.
      if (cancelledRef.current) return
      netFailRef.current += 1
      if (netFailRef.current >= 2) setConnection("down")
      return
    }

    if (cancelledRef.current) return

    // Sukses menerima respons → koneksi jelas hidup (403/404 juga berarti
    // server terjangkau, jadi ini di-set sebelum cek status HTTP).
    netFailRef.current = 0
    setConnection("ok")

    if (response.status === 404) {
      setStatus("not_found")
      handlersRef.current.onNotFound?.()
      return
    }
    if (response.status === 403) {
      setStatus("forbidden")
      handlersRef.current.onForbidden?.()
      return
    }
    if (!response.ok) {
      setStatus("error")
      return
    }

    let data
    try {
      data = await response.json()
    } catch {
      return
    }

    if (cancelledRef.current) return

    // Hanya sentuh state React kalau server bilang ada yang berubah.
    if (data.version !== lastVersionRef.current) {
      lastVersionRef.current = data.version
      setState(data)
    }
    setStatus("ready")
  }, [buildUrl])

  const refresh = useCallback(() => {
    tick()
  }, [tick])

  useEffect(() => {
    if (!enabled) return undefined

    cancelledRef.current = false
    // Identitas berubah (mis. token host baru muncul) → mulai dari nol lagi.
    lastVersionRef.current = -1

    // eslint-disable-next-line react-hooks/set-state-in-effect -- tick pertama adalah langganan ke server (external system)
    tick()
    const id = setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      cancelledRef.current = true
      clearInterval(id)
    }
    // `auth` sengaja TIDAK jadi dependensi: identitas dibaca lewat ref agar
    // effect tidak restart setiap render (objek auth dibuat ulang terus).
  }, [code, tick, enabled])

  return { state, status, refresh, connection }
}

/**
 * Kirim POST JSON dan kembalikan `{ ok, status, data, error }`.
 * Tidak pernah melempar — pemanggil cukup memeriksa `ok`.
 */
/**
 * Batas waktu satu request tulis (POST/PUT/PATCH/DELETE). Tanpa ini, koneksi
 * yang menggantung membuat `sending` true selamanya → semua opsi pemain
 * ter-disable dan jawaban tidak pernah terkirim. 15 detik cukup longgar untuk
 * jaringan lambat, tapi memutus koneksi mati.
 */
const WRITE_TIMEOUT_MS = 15_000

async function requestJson(method, url, body, headers = {}) {
  // AbortController membatalkan fetch saat melewati batas waktu, supaya
  // pemanggil menerima kegagalan yang jelas alih-alih menunggu tanpa ujung.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WRITE_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
      cache: "no-store",
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body ?? {}),
    })

    let data = null
    try {
      data = await response.json()
    } catch {
      data = null
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: data?.error || null,
    }
  } catch (error) {
    const timedOut = error?.name === "AbortError"
    return {
      ok: false,
      status: 0,
      data: null,
      error: timedOut
        ? "Server tidak merespons. Periksa koneksimu lalu coba lagi."
        : "Tidak bisa menghubungi server. Periksa koneksimu.",
    }
  } finally {
    clearTimeout(timer)
  }
}

/** POST JSON — bentuk balasan sama untuk semua helper requestJson. */
export function postJson(url, body, headers = {}) {
  return requestJson("POST", url, body, headers)
}

/** PUT JSON — dipakai simpan-ke-template (ganti template milik sendiri). */
export function putJson(url, body, headers = {}) {
  return requestJson("PUT", url, body, headers)
}

/** PATCH JSON — dipakai aksi admin & ganti nama. */
export function patchJson(url, body, headers = {}) {
  return requestJson("PATCH", url, body, headers)
}

/** DELETE JSON — hapus template/akun. Body boleh kosong. */
export function deleteJson(url, headers = {}) {
  return requestJson("DELETE", url, undefined, headers)
}

/** GET JSON — dipakai template & auth. */
export function getJson(url, headers = {}) {
  return requestJson("GET", url, undefined, headers)
}

/** Normalisasi input kode room: uppercase, hanya huruf/angka, maks 6. */
export function normalizeCodeInput(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)
}

// ─── Identitas akun (CONTRACT §3) ──────────────────────────────────────────

/**
 * Pembungkus kecil useAuth untuk halaman yang hanya butuh "siapa yang masuk".
 * Memisahkan useAuth ke satu titik supaya kalau kelak bentuk snapshot berubah
 * (misalnya token ditempel ke setiap request), perubahannya cukup di sini.
 *
 * @returns {{ user: object|null, loaded: boolean, ownerId: string }}
 *   ownerId = id akun sebagai string, atau "tamu" bila belum masuk.
 */
export function useAuthUser() {
  const { user, loaded } = useAuth()
  return { user, loaded, ownerId: user ? String(user.id) : "tamu" }
}
