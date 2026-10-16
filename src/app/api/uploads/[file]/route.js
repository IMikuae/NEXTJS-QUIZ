import fs from "node:fs"
import path from "node:path"

import { UPLOAD_ID_RE, MIME_BY_EXT } from "@/lib/uploads"
import { deleteUploadForOwner, getUpload } from "@/lib/db"
import { requireUser } from "@/lib/auth"
import { json, jsonError } from "@/lib/http"

// Membaca/menghapus berkas dari disk → wajib runtime Node.
export const runtime = "nodejs"

/** Folder penyimpanan gambar — sama dengan yang dipakai route POST. */
const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads")

// GET /api/uploads/[file] — sajikan gambar yang pernah diunggah.
//
// Rute ini PUBLIK (gambar dipakai di halaman template & soal), jadi nama
// berkasnya divalidasi dengan regex SEBELUM menyentuh disk. Tanpa penjagaan
// itu, "/api/uploads/..%2F..%2Fquiz.db" adalah path traversal klasik: nama
// dari URL masuk apa adanya ke path.join, dan path.join merapikan ".." tanpa
// bertanya. Regex hanya menerima 32 huruf hex + ekstensi gambar yang dikenal,
// jadi tidak ada satu pun karakter yang bisa dipakai keluar dari folder.
export async function GET(request, { params }) {
  const { file } = await params

  if (typeof file !== "string" || !UPLOAD_ID_RE.test(file)) {
    return new Response("Gambar tidak ditemukan.", { status: 404 })
  }

  const ext = file.slice(file.lastIndexOf(".") + 1)
  const mime = MIME_BY_EXT[ext]
  if (!mime) {
    return new Response("Gambar tidak ditemukan.", { status: 404 })
  }

  // Baris DB diperiksa lebih dulu: berkas yang tidak pernah tercatat (mis.
  // sisa unggahan yang gagal) tidak disajikan.
  const row = getUpload(file.slice(0, file.lastIndexOf(".")))
  if (!row) {
    return new Response("Gambar tidak ditemukan.", { status: 404 })
  }

  let buffer
  try {
    buffer = fs.readFileSync(path.join(UPLOAD_DIR, file))
  } catch {
    return new Response("Gambar tidak ditemukan.", { status: 404 })
  }

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": mime,
      // Nama berkas mengandung 128 bit entropi dan isinya tidak pernah
      // berubah, jadi cache selamanya aman — dan menghemat satu request per
      // gambar di setiap polling.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

// DELETE /api/uploads/[file] — hapus satu gambar milik sendiri.
//
// Hanya PEMILIK yang boleh menghapus. `deleteUploadForOwner(id, ownerId)`
// memasukkan owner_id ke WHERE, jadi menebak id gambar orang lain tidak
// berguna: query-nya tidak menghapus apa pun.
//
// Berkas di disk dihapus SETELAH baris DB; kalau unlink gagal, barisnya sudah
// hilang sehingga kuota tetap terbebas dan berkas yatim tidak akan pernah
// disajikan GET (GET memeriksa baris DB lebih dulu).
export async function DELETE(request, { params }) {
  const auth = await requireUser()
  if (!auth.ok) return auth.response

  const { file } = await params
  if (typeof file !== "string" || !UPLOAD_ID_RE.test(file)) {
    return jsonError("Gambar tidak ditemukan.", 404)
  }

  const id = file.slice(0, file.lastIndexOf("."))
  const row = getUpload(id)
  if (!row) {
    return jsonError("Gambar tidak ditemukan.", 404)
  }
  if (row.ownerId !== auth.user.id) {
    // 404, bukan 403: jangan mengonfirmasi keberadaan gambar milik orang lain.
    return jsonError("Gambar tidak ditemukan.", 404)
  }

  const removed = deleteUploadForOwner(id, auth.user.id)
  if (!removed) {
    return jsonError("Gambar tidak ditemukan.", 404)
  }

  try {
    fs.unlinkSync(path.join(UPLOAD_DIR, file))
  } catch {
    // Baris sudah terhapus; berkas yatim tidak akan pernah disajikan.
  }

  return json({ ok: true }, 200)
}
