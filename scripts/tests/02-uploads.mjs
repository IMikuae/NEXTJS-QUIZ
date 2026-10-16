import { sniffImageType, readImageSize, decodeDataUrl, UPLOAD_ID_RE } from "../../src/lib/uploads.js"
import * as db from "../../src/lib/db.js"
// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("2. uploads.js")

/** PNG 1×1 minimal dengan IHDR berisi lebar/tinggi yang bisa diuji. */
function makePng(width, height) {
  const buf = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0)
  buf.writeUInt32BE(13, 8) // panjang chunk IHDR
  buf.write("IHDR", 12, "ascii")
  buf.writeUInt32BE(width, 16)
  buf.writeUInt32BE(height, 20)
  buf[24] = 8 // bit depth
  buf[25] = 6 // color type
  return buf
}

/** JPEG dengan SOF0 berisi dimensi. */
function makeJpeg(width, height) {
  const parts = [
    Buffer.from([0xff, 0xd8]), // SOI
    Buffer.from([0xff, 0xe0, 0x00, 0x10]), // APP0, panjang 16
    Buffer.alloc(14),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]), // SOF0, panjang 17, presisi 8
    Buffer.from([(height >> 8) & 0xff, height & 0xff]),
    Buffer.from([(width >> 8) & 0xff, width & 0xff]),
    Buffer.alloc(8),
    Buffer.from([0xff, 0xd9]), // EOI
  ]
  return Buffer.concat(parts)
}

/** GIF dengan logical screen descriptor. */
function makeGif(width, height) {
  const buf = Buffer.alloc(20)
  buf.write("GIF89a", 0, "ascii")
  buf.writeUInt16LE(width, 6)
  buf.writeUInt16LE(height, 8)
  return buf
}

/** WebP varian VP8X (extended) — lebar/tinggi 24-bit minus satu. */
function makeWebpVp8x(width, height) {
  const buf = Buffer.alloc(40)
  buf.write("RIFF", 0, "ascii")
  buf.writeUInt32LE(32, 4)
  buf.write("WEBP", 8, "ascii")
  buf.write("VP8X", 12, "ascii")
  buf.writeUInt32LE(10, 16)
  const w = width - 1
  const h = height - 1
  buf[24] = w & 0xff
  buf[25] = (w >> 8) & 0xff
  buf[26] = (w >> 16) & 0xff
  buf[27] = h & 0xff
  buf[28] = (h >> 8) & 0xff
  buf[29] = (h >> 16) & 0xff
  return buf
}

/** WebP varian VP8 (lossy) — 14 bit lebar/tinggi little-endian. */
function makeWebpVp8(width, height) {
  const buf = Buffer.alloc(40)
  buf.write("RIFF", 0, "ascii")
  buf.writeUInt32LE(32, 4)
  buf.write("WEBP", 8, "ascii")
  buf.write("VP8 ", 12, "ascii")
  buf.writeUInt32LE(20, 16)
  // frame tag 3 byte + start code 9d 01 2a
  buf[23] = 0x9d
  buf[24] = 0x01
  buf[25] = 0x2a
  buf.writeUInt16LE(width, 26)
  buf.writeUInt16LE(height, 28)
  return buf
}

/** WebP varian VP8L (lossless) — 14 bit lebar/tinggi dipadatkan. */
function makeWebpVp8l(width, height) {
  const buf = Buffer.alloc(40)
  buf.write("RIFF", 0, "ascii")
  buf.writeUInt32LE(32, 4)
  buf.write("WEBP", 8, "ascii")
  buf.write("VP8L", 12, "ascii")
  buf.writeUInt32LE(20, 16)
  buf[20] = 0x2f
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
  buf.writeUInt32LE(bits >>> 0, 21)
  return buf
}

test("sniffImageType: PNG, JPG, GIF, WebP dikenali", () => {
  assert.deepEqual(sniffImageType(makePng(3, 4)), { ext: "png", mime: "image/png" })
  assert.deepEqual(sniffImageType(makeJpeg(3, 4)), { ext: "jpg", mime: "image/jpeg" })
  assert.deepEqual(sniffImageType(makeGif(3, 4)), { ext: "gif", mime: "image/gif" })
  assert.deepEqual(sniffImageType(makeWebpVp8x(3, 4)), { ext: "webp", mime: "image/webp" })
})

test("sniffImageType: buffer sampah → null", () => {
  assert.equal(sniffImageType(Buffer.from("ini bukan gambar sama sekali, hanya teks biasa")), null)
  assert.equal(sniffImageType(Buffer.alloc(0)), null)
  assert.equal(sniffImageType(null), null)
  assert.equal(sniffImageType(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b])), null)
  // RIFF tanpa WEBP di offset 8 → bukan WebP.
  const riffOnly = Buffer.alloc(20)
  riffOnly.write("RIFF", 0, "ascii")
  riffOnly.write("AVI ", 8, "ascii")
  assert.equal(sniffImageType(riffOnly), null)
})

test("readImageSize: PNG 640×480", () => {
  assert.deepEqual(readImageSize(makePng(640, 480), "png"), { width: 640, height: 480 })
})

test("readImageSize: JPEG 800×600", () => {
  assert.deepEqual(readImageSize(makeJpeg(800, 600), "jpg"), { width: 800, height: 600 })
})

test("readImageSize: GIF 320×240", () => {
  assert.deepEqual(readImageSize(makeGif(320, 240), "gif"), { width: 320, height: 240 })
})

test("readImageSize: WebP ketiga varian", () => {
  assert.deepEqual(readImageSize(makeWebpVp8x(1024, 768), "webp"), { width: 1024, height: 768 })
  assert.deepEqual(readImageSize(makeWebpVp8(400, 300), "webp"), { width: 400, height: 300 })
  assert.deepEqual(readImageSize(makeWebpVp8l(200, 150), "webp"), { width: 200, height: 150 })
})

test("readImageSize: header rusak → null, tidak melempar", () => {
  assert.equal(readImageSize(Buffer.from("rusak"), "png"), null)
  assert.equal(readImageSize(makePng(10, 10), "xyz"), null)
  assert.equal(readImageSize(null, "png"), null)
})

test("UPLOAD_ID_RE menerima hanya 32 hex + ekstensi gambar", () => {
  const id = "a".repeat(32)
  assert.equal(UPLOAD_ID_RE.test(`${id}.png`), true)
  assert.equal(UPLOAD_ID_RE.test(`${id}.jpg`), true)
  assert.equal(UPLOAD_ID_RE.test(`${id}.gif`), true)
  assert.equal(UPLOAD_ID_RE.test(`${id}.webp`), true)
  assert.equal(UPLOAD_ID_RE.test(`${id}.svg`), false)
  assert.equal(UPLOAD_ID_RE.test(`../${id}.png`), false)
  assert.equal(UPLOAD_ID_RE.test(`${"A".repeat(32)}.png`), false)
  assert.equal(UPLOAD_ID_RE.test(`${"a".repeat(31)}.png`), false)
  assert.equal(UPLOAD_ID_RE.test("../../quiz.db"), false)
})

test("decodeDataUrl: data URL sah & yang ditolak", () => {
  const png = makePng(2, 2).toString("base64")
  const decoded = decodeDataUrl(`data:image/png;base64,${png}`)
  assert.equal(decoded.ok, true)
  assert.equal(decoded.buffer.length, 33)

  assert.equal(decodeDataUrl("bukan data url").ok, false)
  assert.equal(decodeDataUrl(`data:image/png,${png}`).ok, false)
  assert.equal(decodeDataUrl(undefined).ok, false)
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. VALIDASI
// ═══════════════════════════════════════════════════════════════════════════
