// ═══════════════════════════════════════════════════════════════════════════
// HTTP HELPER — respons JSON, pembacaan body berbatas, IP klien, base URL
// ═══════════════════════════════════════════════════════════════════════════
// Semua error memakai bentuk { error: "pesan ramah" }. Tidak pernah ada
// stack trace, path filesystem, atau detail internal yang ikut terkirim.
// ═══════════════════════════════════════════════════════════════════════════

/** Batas ukuran body untuk POST /api/rooms (128 KB). */
export const MAX_BODY_BYTES = 128 * 1024

/**
 * Batas ukuran body untuk request kecil lain (join/answer/next/start/auth).
 *
 * 16 KB, bukan 8 KB: payload jawaban kini memuat `questionIndex`/`optionIndex`
 * plus field tambahan dari klien (mis. `playerId`, `token`), dan body auth
 * memuat `name`/`pin`/`role`/`kelas`. 16 KB masih jauh di bawah batas yang
 * berbahaya tapi menyisakan ruang yang nyaman.
 */
export const MAX_SMALL_BODY_BYTES = 16 * 1024

/** Batas ukuran body untuk POST /api/uploads (5 MB — data URL base64). */
export const MAX_IMAGE_BODY_BYTES = 5 * 1024 * 1024

/**
 * Batas ukuran body untuk template (256 KB).
 *
 * Satu template boleh memuat sampai 100 soal, masing-masing dengan 4 opsi,
 * gambar, gambar per opsi, dan penjelasan — payload terbesar yang sah masih
 * jauh di bawah 256 KB, tapi cukup longgar untuk teks panjang ber-UTF-8.
 */
export const MAX_TEMPLATE_BODY_BYTES = 256 * 1024

/**
 * Bungkus data menjadi Response JSON.
 * Selalu `Cache-Control: no-store` — state kuis tidak boleh di-cache.
 */
export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  })
}

/** Respons error ramah. */
export function jsonError(message, status, extraHeaders = {}) {
  return json({ error: message }, status, extraHeaders)
}

/**
 * Baca body request sambil menegakkan batas byte.
 *
 * Dibaca lewat reader (bukan request.text()) supaya klien yang mengirim
 * payload raksasa tidak pernah masuk sepenuhnya ke memori. Header
 * Content-Length dipakai lebih dulu sebagai penolakan cepat, lalu jumlah
 * byte sebenarnya tetap dihitung — klien bisa saja berbohong soal
 * Content-Length atau memakai chunked encoding.
 *
 * @returns {Promise<{ ok: true, text: string } | { ok: false, reason: "too_large" | "read_error" }>}
 */
export async function readBodyWithLimit(request, limit = MAX_SMALL_BODY_BYTES) {
  const declared = Number(request.headers.get("content-length") || 0)
  if (Number.isFinite(declared) && declared > limit) {
    return { ok: false, reason: "too_large" }
  }

  if (!request.body) return { ok: true, text: "" }

  const reader = request.body.getReader()
  const chunks = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel().catch(() => {})
        return { ok: false, reason: "too_large" }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, reason: "read_error" }
  }

  return { ok: true, text: Buffer.concat(chunks).toString("utf8") }
}

/**
 * Baca body JSON dengan batas ukuran.
 *
 * @returns {Promise<{ ok: true, data: any } | { ok: false, response: Response }>}
 */
export async function readJsonBody(request, limit = MAX_SMALL_BODY_BYTES) {
  const body = await readBodyWithLimit(request, limit)
  if (!body.ok) {
    return {
      ok: false,
      response: jsonError(
        body.reason === "too_large"
          ? "Data yang dikirim terlalu besar."
          : "Gagal membaca isi permintaan.",
        body.reason === "too_large" ? 413 : 400
      ),
    }
  }

  if (body.text.trim() === "") return { ok: true, data: {} }

  let data
  try {
    data = JSON.parse(body.text)
  } catch {
    return { ok: false, response: jsonError("Body harus berupa JSON yang valid.", 400) }
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, response: jsonError("Body harus berupa objek JSON.", 400) }
  }

  return { ok: true, data }
}

/**
 * Apakah reverse proxy tepercaya?
 *
 * DEFAULT: TIDAK. `X-Forwarded-For` bisa dipalsukan siapa saja yang bisa
 * menghubungi server langsung, jadi mempercayainya secara default berarti
 * rate limit bisa dilewati hanya dengan mengganti header. Proxy hanya
 * dipercaya bila operator secara eksplisit menyetel `TRUST_PROXY=1`.
 */
function trustProxyEnabled() {
  const value = (process.env.TRUST_PROXY || "").trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

/** Hash FNV-1a 32-bit — untuk sidik jari header, bukan kriptografi. */
function fingerprint(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/**
 * Ambil identitas klien untuk rate limit.
 *
 * Prioritas:
 *   1. IP asli dari proxy — HANYA bila `TRUST_PROXY=1` (opt-in).
 *   2. Sidik jari dari header yang dikirim browser (User-Agent, Accept-Language,
 *      Sec-CH-UA). Ini TIDAK sekuat IP, tapi tujuannya menghindari satu bucket
 *      global: tanpa ini, semua klien tanpa proxy berbagi kunci yang sama dan
 *      satu penyerang bisa mengunci seluruh pengguna dari login.
 *
 * Nilai selalu berupa string non-kosong.
 */
export function clientIp(request) {
  if (trustProxyEnabled()) {
    const xff = request.headers.get("x-forwarded-for")
    if (xff) {
      const first = xff.split(",")[0].trim()
      if (first) return first
    }
    const real = request.headers.get("x-real-ip")
    if (real && real.trim()) return real.trim()
  }

  const ua = request.headers.get("user-agent") || ""
  const lang = request.headers.get("accept-language") || ""
  const ch = request.headers.get("sec-ch-ua") || ""
  const text = `${ua}|${lang}|${ch}`
  if (text === "||") return "anon"
  return `fp:${fingerprint(text)}`
}

/**
 * Base URL absolut untuk membangun hostUrl / playUrl.
 * Prioritas: env PUBLIC_BASE_URL → header Host (hormati X-Forwarded-Proto).
 */
export function baseUrl(request) {
  const configured = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
  if (configured) return configured

  const forwardedProto = trustProxyEnabled()
    ? request.headers.get("x-forwarded-proto")?.split(",")[0].trim()
    : null
  const proto = forwardedProto || new URL(request.url).protocol.replace(":", "")
  const host = request.headers.get("host") || new URL(request.url).host
  return `${proto}://${host}`
}

/**
 * Ambil token host dari request. Menerima DUA bentuk:
 *   - header `X-Host-Token` (nyaman untuk curl / otomasi)
 *   - body JSON `{ hostToken }` (nyaman dari form di browser)
 * Header diprioritaskan bila keduanya ada.
 *
 * @param {Request} request
 * @param {any} body — body JSON yang sudah di-parse (boleh undefined)
 * @returns {string} token, atau "" bila tidak ada
 */
export function hostTokenFrom(request, body) {
  const header = request.headers.get("x-host-token")
  if (typeof header === "string" && header.trim() !== "") return header.trim()
  const fromBody = body?.hostToken
  if (typeof fromBody === "string" && fromBody.trim() !== "") return fromBody.trim()
  return ""
}

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMIT — fixed window in-memory per kunci
// ═══════════════════════════════════════════════════════════════════════════
// Bukan proteksi DDoS — hanya memperlambat spam pembuatan room.
// Disimpan di globalThis supaya tidak reset saat hot-reload di mode dev.
// ═══════════════════════════════════════════════════════════════════════════

const globalForRateLimit = globalThis
if (!globalForRateLimit.__liveQuizRateBuckets) {
  globalForRateLimit.__liveQuizRateBuckets = new Map()
}
const buckets = globalForRateLimit.__liveQuizRateBuckets

let lastSweep = 0
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

/** Buang bucket yang window-nya sudah lewat supaya Map tidak tumbuh terus. */
function sweep(now) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return
  lastSweep = now
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key)
  }
}

/**
 * Konsumsi satu jatah untuk `key`.
 *
 * @returns {{ allowed: boolean, retryAfter: number }} retryAfter dalam detik
 */
export function consume(key, max, windowMs) {
  const now = Date.now()
  sweep(now)

  const entry = buckets.get(key)
  if (!entry || now >= entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  if (entry.count >= max) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }

  entry.count += 1
  return { allowed: true, retryAfter: 0 }
}

export const LIMITS = {
  // Maksimum 10 room per menit per IP.
  createRoom: { max: 10, windowMs: 60 * 1000 },
  // Login & register berbagi jatah yang sama (lihat route-nya): 10 percobaan
  // per menit per IP. Menghitung keduanya terpisah akan menggandakan jumlah
  // tebakan PIN yang bisa dicoba dari satu koneksi.
  login: { max: 10, windowMs: 60 * 1000 },
  // Unggahan gambar: 20 per menit per IP.
  upload: { max: 20, windowMs: 60 * 1000 },
  // Operasi tulis template (POST/PUT/DELETE/clone): 30 per menit per IP.
  templateWrite: { max: 30, windowMs: 60 * 1000 },
  // Data lengkap template bawaan (GET /api/templates/builtin/[id]): 60 per
  // menit per IP. Hanya dipanggil saat pengguna memilih memakai template.
  builtinRead: { max: 60, windowMs: 60 * 1000 },
  // Bergabung ke room: 30 per menit per IP. Cukup untuk satu kelas yang
  // menekan "Gabung" serentak, tapi membendung skrip yang membuat ribuan
  // pemain palsu untuk mengisi memori.
  join: { max: 30, windowMs: 60 * 1000 },
  // Kirim jawaban: 120 per menit per IP. Satu pemain mengirim paling banyak
  // satu jawaban per soal; batas ini murni menahan spam.
  answer: { max: 120, windowMs: 60 * 1000 },
  // Polling state: 600 per menit per identitas. Satu klien memanggil 1×/detik
  // (60/menit); batas ini memberi ruang untuk satu kelas di belakang NAT yang
  // sama tanpa memutus polling normal.
  state: { max: 600, windowMs: 60 * 1000 },
  // Aksi host (start/next/skip/end/lock/kick/restart/extend/advance): 120 per
  // menit per IP. Semua aksi ini menuntut token host, jadi batasnya hanya
  // menahan spam/brute-force — bukan alur normal (host jarang menekan tombol).
  hostAction: { max: 120, windowMs: 60 * 1000 },
}
