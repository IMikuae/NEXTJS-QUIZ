import { NextResponse } from "next/server"

// ═══════════════════════════════════════════════════════════════════════════
// Header keamanan + nonce CSP + no-store untuk /api/*
// ═══════════════════════════════════════════════════════════════════════════
// CSP ketat: `script-src` TIDAK lagi memakai `'unsafe-inline'`. Next.js
// menyuntikkan bootstrap hidrasi sebagai script INLINE, jadi setiap request
// diberi nonce acak. Nonce dikirim ke Next lewat header CSP pada REQUEST —
// itulah satu-satunya cara Next mengenali nonce dan menempelkannya ke tag
// <script>/<style> miliknya (lihat komentar di middleware()).
//
// Browser modern mengabaikan `'unsafe-inline'` begitu sebuah nonce ada, tapi
// demi kompatibilitas browser LAMA (yang tidak memahami nonce dan karena itu
// akan memblokir SEMUA script) kami kirim CSP berbeda untuk browser turunan
// Chrome lama — lihat pemilihan di bawah. Browser modern dapat versi ketat.
//
// `X-Frame-Options: DENY` + `frame-ancestors 'none'` penting di sini: halaman
// host memegang token host di sessionStorage, dan membingkainya adalah langkah
// awal clickjacking yang bisa menekan tombol "Mulai Kuis".
// ═══════════════════════════════════════════════════════════════════════════

/** Nonce acak 16 byte base64 — lenyap setiap request. */
function generateNonce() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

/**
 * Susun CSP.
 *
 * @param {string|null} nonce — null berarti skema longgar `'unsafe-inline'`
 *   (hanya untuk browser turunan Chrome <60 yang tidak mengenal nonce).
 */
function buildCsp(nonce) {
  const scriptSrc = nonce
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "'self' 'unsafe-inline'"
  // Style dipecah dua (CSP Level 3):
  //   • style-src-elem — tag <style>/<link>. Ketat: nonce saja, TANPA
  //     'unsafe-inline'. Ini vektor injeksi CSS (exfiltrasi, UI redress)
  //     yang kita tutup.
  //   • style-src-attr — atribut `style=`. Nonce TIDAK bisa dipasang ke
  //     atribut, dan app memakai ±350 atribut style statis, jadi atribut
  //     tetap 'unsafe-inline' sampai gaya itu diekstrak ke class CSS.
  // `style-src` (fallback) tetap memuat 'unsafe-inline' untuk browser yang
  // belum mengenal -elem/-attr; browser modern mengabaikannya.
  const styleSrc = nonce
    ? `'self' 'unsafe-inline' 'nonce-${nonce}'`
    : "'self' 'unsafe-inline'"
  const styleElemSrc = nonce ? `'self' 'nonce-${nonce}'` : "'self' 'unsafe-inline'"
  const styleAttrSrc = "'unsafe-inline'"

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    `style-src-elem ${styleElemSrc}`,
    `style-src-attr ${styleAttrSrc}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ")
}

/** Chrome <60 tidak mengenal `'strict-dynamic'` dan tidak menerapkan nonce. */
function isLegacyChrome(ua, version) {
  return /chrome|chromium/i.test(ua) && version >= 0 && version < 60
}

export function middleware(request) {
  const nonce = generateNonce()

  // Pilih CSP berdasarkan versi browser. Browser tanpa info versi dianggap
  // modern (mendapat CSP ketat) — itu jalur aman: nonce dihormati, dan bila
  // tidak punya script inline tak-terpercaya, tidak ada yang rusak.
  const ua = request.headers.get("user-agent") || ""
  const chromeMatch = ua.match(/Chrom(?:e|ium)\/(\d+)/)
  const chromeVersion = chromeMatch ? Number(chromeMatch[1]) : NaN
  const legacy = isLegacyChrome(ua, chromeVersion)

  const csp = buildCsp(legacy ? null : nonce)

  // Next.js HANYA membaca nonce dari header CSP pada REQUEST, lalu menempelkan
  // nonce itu ke <script>/<style> inline yang ia render. Menyetel `x-nonce`
  // saja tidak cukup — tanpa CSP di request, Next merender `nonce="$undefined"`
  // dan CSP ketat justru memblokir hidrasi. Jadi keduanya disetel: request
  // (agar Next menempelkan nonce) dan response (agar browser menegakkan CSP).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })

  response.headers.set("Content-Security-Policy", csp)
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "no-referrer")
  response.headers.set("X-DNS-Prefetch-Control", "off")
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  )

  // HSTS hanya bila deployment memang di HTTPS. Menyetelnya di HTTP akan
  // mengunci browser ke https:// untuk host yang tidak menyediakannya.
  if ((process.env.PUBLIC_BASE_URL || "").trim().startsWith("https://")) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }

  const { pathname } = request.nextUrl

  // State kuis berubah setiap detik — jangan pernah masuk cache perantara.
  if (pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store, max-age=0")
  }

  return response
}

export const config = {
  // Lewati aset statis Next — tidak ada gunanya menambahkan header di sana.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
