import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

import { LIMITS, MAX_IMAGE_BODY_BYTES, clientIp, consume, json, jsonError, readJsonBody } from "@/lib/http"
import { requireUser } from "@/lib/auth"
import { countUploadsByOwner, insertUpload, listUploadsByOwner } from "@/lib/db"
import { MAX_UPLOADS_PER_USER, decodeDataUrl, readImageSize, sniffImageType } from "@/lib/uploads"

// Menulis berkas ke disk + mencatat baris di SQLite → wajib runtime Node.
export const runtime = "nodejs"

/** Folder penyimpanan gambar: data/uploads (di luar src, tidak di-bundle). */
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads")

function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

/** 32 karakter hex acak (16 byte entropi) — nama berkas unggahan. */
function randomHex32() {
  return crypto.randomBytes(16).toString("hex")
}

// GET /api/uploads — daftar gambar milik akun yang sedang masuk.
//
// Dipakai panel "Kelola gambar" di editor. Dibatasi ke pemilik sendiri; tidak
// ada cara melihat unggahan akun lain.
export async function GET() {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const rows = listUploadsByOwner(auth.user.id)
  return json(
    {
      uploads: rows.map((row) => ({
        url: `/api/uploads/${row.id}.${row.ext}`,
        id: row.id,
        ext: row.ext,
        bytes: row.bytes,
        createdAt: row.createdAt,
      })),
      used: rows.length,
      limit: MAX_UPLOADS_PER_USER,
    },
    200
  )
}

// POST /api/uploads — simpan satu gambar, balas URL-nya.
//
// Body: { data: "data:image/png;base64,…" }
//
// Urutan kerja yang penting:
//   1. wajib login → 2. rate limit → 3. batas jumlah per akun → 4. baca body
//   berbatas → 5. dekode base64 → 6. TENTUKAN TIPE DARI MAGIC BYTES (bukan
//   dari string data URL yang bisa berbohong) → 7. tulis berkas → 8. catat DB.
//
// Nama berkas dibuat SERVER (32 hex acak), bukan diambil dari klien, jadi
// tidak ada jalur path traversal maupun tabrakan nama.
export async function POST(request) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { allowed, retryAfter } = consume(
    `upload:${auth.user.id}:${clientIp(request)}`,
    LIMITS.upload.max,
    LIMITS.upload.windowMs
  )
  if (!allowed) {
    return jsonError("Terlalu banyak unggahan. Coba lagi sebentar lagi.", 429, {
      "Retry-After": String(retryAfter),
    })
  }

  const used = countUploadsByOwner(auth.user.id)
  if (used >= MAX_UPLOADS_PER_USER) {
    return jsonError(
      `Batas ${MAX_UPLOADS_PER_USER} gambar per akun sudah tercapai. Hapus beberapa gambar dulu.`,
      429
    )
  }

  const body = await readJsonBody(request, MAX_IMAGE_BODY_BYTES)
  if (!body.ok) return body.response

  const decoded = decodeDataUrl(body.data?.data)
  if (!decoded.ok) return jsonError(decoded.error, 400)

  const type = sniffImageType(decoded.buffer)
  if (!type) {
    return jsonError("Berkas itu bukan gambar PNG, JPG, GIF, atau WebP.", 400)
  }

  // Dimensi hanya untuk pratinjau — gagal baca bukan alasan menolak unggahan.
  const size = readImageSize(decoded.buffer, type.ext)

  const id = randomHex32()
  const filename = `${id}.${type.ext}`

  ensureUploadDir()
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), decoded.buffer)
  } catch {
    return jsonError("Gambar gagal disimpan. Coba lagi.", 500)
  }

  try {
    insertUpload({
      id,
      ownerId: auth.user.id,
      ext: type.ext,
      bytes: decoded.buffer.length,
    })
  } catch {
    // Baris DB gagal ditulis → berkas sudah ada tapi tidak terhitung kuota.
    // Dibuang supaya tidak ada berkas yatim yang menumpuk tanpa pemilik.
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, filename))
    } catch {
      // abaikan
    }
    return jsonError("Gambar gagal dicatat. Coba lagi.", 500)
  }

  return json(
    {
      url: `/api/uploads/${filename}`,
      width: size?.width ?? null,
      height: size?.height ?? null,
    },
    201
  )
}
