// ═══════════════════════════════════════════════════════════════════════════
// UPLOADS — pengenalan tipe gambar & pembacaan dimensi TANPA dependency
// ═══════════════════════════════════════════════════════════════════════════
// Dua fungsi murni, tanpa akses disk dan tanpa akses DB:
//
//   sniffImageType(buffer)  → { ext, mime } dari MAGIC BYTES
//   readImageSize(buffer, ext) → { width, height } dari header format
//
// Kenapa dari magic bytes, bukan dari string data URL: data URL ditulis
// klien dan bisa berbohong ("data:image/png;base64," berisi JPEG, atau lebih
// buruk lagi berisi berkas lain). Magic bytes tidak bisa dibohongi tanpa
// merusak berkasnya sendiri.
//
// Parser dimensi sengaja minimal: hanya header yang dibutuhkan, tidak ada
// dekode piksel, tidak ada alokasi untuk data gambar. Kalau header tidak
// dikenal/rusak → `null` (bukan melempar) supaya unggahan tetap tersimpan
// walau dimensinya tidak terbaca — lebar/tinggi hanya dipakai untuk
// menampilkan pratinjau, bukan untuk apa pun yang kritikal.
// ═══════════════════════════════════════════════════════════════════════════

/** Format yang diterima, dipetakan dari tipe terdeteksi. */
export const IMAGE_TYPES = {
  png: { ext: "png", mime: "image/png" },
  jpg: { ext: "jpg", mime: "image/jpeg" },
  gif: { ext: "gif", mime: "image/gif" },
  webp: { ext: "webp", mime: "image/webp" },
}

export const UPLOAD_EXTENSIONS = ["png", "jpg", "gif", "webp"]

/** Mime per ekstensi — dipakai GET /api/uploads/[file] untuk Content-Type. */
export const MIME_BY_EXT = Object.fromEntries(
  Object.values(IMAGE_TYPES).map((type) => [type.ext, type.mime])
)

/** Nama berkas unggahan yang sah di URL. SELAIN ini ditolak 404. */
export const UPLOAD_ID_RE = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/

/** Maksimum byte SETELAH base64 didekode (2,5 MB) — lihat CONTRACT §4. */
export const MAX_IMAGE_BYTES = Math.floor(2.5 * 1024 * 1024)

/** Maksimum gambar per akun. */
export const MAX_UPLOADS_PER_USER = 100

// ═══════════════════════════════════════════════════════════════════════════
// PENGENALAN TIPE
// ═══════════════════════════════════════════════════════════════════════════

/** Bandingkan byte di posisi `offset` dengan deretan nilai yang diharapkan. */
function matchesAt(buffer, offset, bytes) {
  if (buffer.length < offset + bytes.length) return false
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false
  }
  return true
}

/**
 * Tebak tipe gambar dari magic bytes.
 *
 *   PNG  : 89 50 4E 47 0D 0A 1A 0A
 *   JPEG : FF D8 FF
 *   GIF  : "GIF8" (GIF87a / GIF89a)
 *   WebP : "RIFF" …. "WEBP" pada offset 8
 *
 * @param {Buffer|Uint8Array} buffer
 * @returns {{ ext: string, mime: string } | null}
 */
export function sniffImageType(buffer) {
  if (!buffer || typeof buffer.length !== "number" || buffer.length < 12) return null

  if (matchesAt(buffer, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return IMAGE_TYPES.png
  }
  if (matchesAt(buffer, 0, [0xff, 0xd8, 0xff])) {
    return IMAGE_TYPES.jpg
  }
  if (matchesAt(buffer, 0, [0x47, 0x49, 0x46, 0x38])) {
    return IMAGE_TYPES.gif
  }
  if (
    matchesAt(buffer, 0, [0x52, 0x49, 0x46, 0x46]) &&
    matchesAt(buffer, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return IMAGE_TYPES.webp
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// PEMBACAAN DIMENSI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Baca lebar/tinggi dari header berkas.
 * @returns {{ width: number, height: number } | null}
 */
export function readImageSize(buffer, ext) {
  if (!buffer || typeof buffer.length !== "number") return null
  try {
    switch (ext) {
      case "png":
        return readPngSize(buffer)
      case "jpg":
        return readJpegSize(buffer)
      case "gif":
        return readGifSize(buffer)
      case "webp":
        return readWebpSize(buffer)
      default:
        return null
    }
  } catch {
    // Header rusak/terpotong — bukan alasan untuk menggagalkan unggahan.
    return null
  }
}

/** Dimensi selalu bilangan bulat positif; selain itu anggap gagal baca. */
function valid(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null
  // Batas waras: gambar 100.000 px di satu sisi pasti header palsu.
  if (width > 100000 || height > 100000) return null
  return { width, height }
}

/** PNG — chunk IHDR selalu chunk pertama, dimensi 4 byte big-endian ×2. */
function readPngSize(buffer) {
  if (buffer.length < 24) return null
  // Panjang IHDR (4) + "IHDR" (4) = offset 8; lebar di 16, tinggi di 20.
  if (!matchesAt(buffer, 12, [0x49, 0x48, 0x44, 0x52])) return null
  return valid(buffer.readUInt32BE(16), buffer.readUInt32BE(20))
}

/**
 * GIF — logical screen descriptor: lebar & tinggi 2 byte little-endian di
 * offset 6 dan 8.
 */
function readGifSize(buffer) {
  if (buffer.length < 10) return null
  return valid(buffer.readUInt16LE(6), buffer.readUInt16LE(8))
}

/**
 * JPEG — telusuri segmen sampai ketemu SOFn (0xC0–0xCF, kecuali C4/C8/CC
 * yang bukan penanda frame). Di SOFn: [panjang 2][presisi 1][tinggi 2][lebar 2].
 */
function readJpegSize(buffer) {
  let offset = 2 // lewati SOI (FF D8)

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      // Bukan awal segmen — JPEG yang valid tidak pernah sampai di sini.
      return null
    }
    let marker = buffer[offset + 1]
    // Byte 0xFF boleh berulang sebagai padding sebelum penanda.
    while (marker === 0xff && offset + 2 < buffer.length) {
      offset += 1
      marker = buffer[offset + 1]
    }
    offset += 2

    // Penanda tanpa payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }
    // Awal data terkompresi / akhir gambar — header frame tidak akan muncul lagi.
    if (marker === 0xda || marker === 0xd9) return null

    if (offset + 2 > buffer.length) return null
    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2) return null

    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

    if (isSof) {
      if (offset + 7 > buffer.length) return null
      const height = buffer.readUInt16BE(offset + 3)
      const width = buffer.readUInt16BE(offset + 5)
      return valid(width, height)
    }

    offset += segmentLength
  }

  return null
}

/**
 * WebP — tiga varian kontainer:
 *   "VP8 " (lossy)  : dimensi 14 bit di offset 26 & 28
 *   "VP8L" (lossless): 14 bit lebar & tinggi dipadatkan di offset 21
 *   "VP8X" (extended): lebar-1 & tinggi-1, 24 bit little-endian di 24 & 27
 */
function readWebpSize(buffer) {
  if (buffer.length < 30) return null
  const chunk = String.fromCharCode(buffer[12], buffer[13], buffer[14], buffer[15])

  if (chunk === "VP8X") {
    if (buffer.length < 30) return null
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16))
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16))
    return valid(width, height)
  }

  if (chunk === "VP8 ") {
    if (buffer.length < 30) return null
    // Frame tag 3 byte + start code 3 byte, lalu lebar/tinggi 2 byte LE
    // (14 bit pertama masing-masing; 2 bit atas adalah skala).
    const width = buffer.readUInt16LE(26) & 0x3fff
    const height = buffer.readUInt16LE(28) & 0x3fff
    return valid(width, height)
  }

  if (chunk === "VP8L") {
    if (buffer.length < 25) return null
    if (buffer[20] !== 0x2f) return null
    const bits = buffer.readUInt32LE(21)
    const width = (bits & 0x3fff) + 1
    const height = ((bits >> 14) & 0x3fff) + 1
    return valid(width, height)
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// DATA URL
// ═══════════════════════════════════════════════════════════════════════════

/** Bentuk data URL yang diterima: "data:image/xxx;base64,<isi>". */
const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i

/**
 * Uraikan data URL menjadi buffer.
 *
 * Sengaja TIDAK memeriksa mime dari string (bisa bohong) — mime di sini hanya
 * dipakai untuk pesan error yang ramah. Tipe sebenarnya ditentukan
 * sniffImageType() dari byte hasil dekode.
 *
 * @param {any} data
 * @returns {{ ok: true, buffer: Buffer } | { ok: false, error: string }}
 */
export function decodeDataUrl(data) {
  if (typeof data !== "string") {
    return { ok: false, error: "Field data wajib diisi dan harus berupa teks data URL." }
  }
  const match = DATA_URL_RE.exec(data.trim())
  if (!match) {
    return { ok: false, error: "Format gambar tidak dikenali. Kirim data URL base64." }
  }

  const payload = match[2].replace(/\s+/g, "")
  // Perkiraan ukuran sebelum dekode — menolak lebih awal tanpa mengalokasikan
  // buffer raksasa. 4 karakter base64 ≈ 3 byte, plus padding.
  const estimated = Math.floor((payload.length * 3) / 4)
  if (estimated > MAX_IMAGE_BYTES + 4) {
    return { ok: false, error: "Ukuran gambar maksimal 2,5 MB." }
  }

  const buffer = Buffer.from(payload, "base64")
  if (buffer.length === 0) {
    return { ok: false, error: "Isi gambar kosong." }
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Ukuran gambar maksimal 2,5 MB." }
  }

  return { ok: true, buffer }
}
