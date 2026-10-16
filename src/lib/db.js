// ═══════════════════════════════════════════════════════════════════════════
// DB — SQLite (node:sqlite, modul bawaan Node 22+) untuk data PERSISTEN
// ═══════════════════════════════════════════════════════════════════════════
// Yang disimpan di sini HANYA yang harus bertahan setelah server restart:
//   users · sessions · templates · uploads · rooms_archive
//
// State kuis yang sedang berjalan (room, pemain, jawaban) TIDAK ada di sini —
// itu hidup di memori proses (lihat quiz-store.js) karena berumur detik dan
// tidak boleh menunggu disk di jalur polling 1 detik.
//
// Pola sengaja mengikuti proyek saudara `shorturl/src/lib/db.js`:
//   • instance disimpan di globalThis → hot-reload dev tidak membuka puluhan
//     handle ke file yang sama,
//   • skema dibuat dengan CREATE TABLE IF NOT EXISTS, perubahan skema
//     dilakukan lewat PRAGMA table_info → ALTER TABLE ADD COLUMN,
//   • tiap query adalah SATU baris `db.prepare(...).get/all/run(...)`,
//     bukan lapisan ORM.
//
// Catatan API node:sqlite yang dipakai di sini:
//   db.prepare(sql).get(...)  → satu baris (atau undefined)
//   db.prepare(sql).all(...)  → array baris
//   db.prepare(sql).run(...)  → { changes, lastInsertRowid }
// Boolean disimpan sebagai INTEGER 0/1, JSON sebagai TEXT.
// ═══════════════════════════════════════════════════════════════════════════

import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { hashPin } from "./pin.js"

// QUIZ_DB_PATH dipakai scripts/self-test.mjs supaya pengujian bisa memakai
// file sementara dan TIDAK menyentuh data/quiz.db milik aplikasi.
export const DB_PATH =
  process.env.QUIZ_DB_PATH || path.join(process.cwd(), "data", "quiz.db")

// ─── Akun demo ─────────────────────────────────────────────────────────────
// Di-seed SEKALI saja, yaitu saat tabel `users` masih benar-benar kosong.
// Kalau admin menghapus semuanya dari halaman admin, seed TIDAK diulang —
// perilaku itu disengaja: pengguna yang sudah hapus akun demo tidak boleh
// melihatnya muncul lagi setiap server restart.
//
// PENGAMAN PRODUKSI: akun demo memakai PIN bawaan yang mudah ditebak, jadi
// seed HANYA dijalankan di luar produksi. Override eksplisit:
//   QUIZ_SEED_DEMO=1  → paksa seed (mis. demo/uji coba)
//   QUIZ_SEED_DEMO=0  → paksa JANGAN seed
const DEMO_PIN = "123456"
const DEMO_USERS = [
  { name: "Admin Yue", role: "admin", kelas: null },
  { name: "Bu Rina", role: "guru", kelas: null },
  { name: "Budi", role: "siswa", kelas: "7A" },
  { name: "Sari", role: "siswa", kelas: "7A" },
  { name: "Rudi", role: "siswa", kelas: "7B" },
  { name: "Nina", role: "siswa", kelas: "8A" },
]

/** Apakah akun demo boleh di-seed? Lihat catatan pengaman di atas. */
function shouldSeedDemoUsers() {
  const override = (process.env.QUIZ_SEED_DEMO || "").trim().toLowerCase()
  if (["1", "true", "yes", "on"].includes(override)) return true
  if (["0", "false", "no", "off"].includes(override)) return false
  return process.env.NODE_ENV !== "production"
}

// ─── Koneksi ───────────────────────────────────────────────────────────────

function createDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

  const database = new DatabaseSync(DB_PATH)
  // WAL: pembaca tidak diblokir penulis — penting karena GET /state polling
  // bisa berjalan bersamaan dengan POST /answer.
  database.exec("PRAGMA journal_mode = WAL")
  // ON DELETE CASCADE / SET NULL di skema tidak akan berlaku tanpa ini.
  database.exec("PRAGMA foreign_keys = ON")

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT UNIQUE NOT NULL COLLATE NOCASE,
      role          TEXT NOT NULL,
      kelas         TEXT,
      pin_hash      TEXT NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT,
      category     TEXT,
      subject      TEXT,
      grade_level  TEXT,
      tags         TEXT,
      cover_image  TEXT,
      visibility   TEXT NOT NULL DEFAULT 'private',
      settings     TEXT NOT NULL,
      questions    TEXT NOT NULL,
      clone_count  INTEGER DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_templates_owner ON templates(owner_id);
    CREATE INDEX IF NOT EXISTS idx_templates_public ON templates(visibility, updated_at DESC);

    CREATE TABLE IF NOT EXISTS uploads (
      id         TEXT PRIMARY KEY,
      owner_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ext        TEXT NOT NULL,
      bytes      INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms_archive (
      code         TEXT PRIMARY KEY,
      host_user    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title        TEXT,
      mode         TEXT,
      settings     TEXT,
      summary      TEXT,
      player_count INTEGER,
      started_at   DATETIME,
      ended_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_id);
    CREATE INDEX IF NOT EXISTS idx_archive_host ON rooms_archive(host_user);
  `)

  migrate(database)
  seedDemoUsers(database)

  return database
}

/** Tambahkan kolom yang belum ada — aman dijalankan berulang. */
function migrate(database) {
  const columnsOf = (table) =>
    database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name)

  const ensure = (table, column, ddl) => {
    if (!columnsOf(table).includes(column)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
    }
  }

  // Tabel-tabel di bawah ini semuanya dibuat versi ini, tapi kolom bisa
  // bertambah di versi berikutnya — jalur migrasinya sudah disiapkan.
  ensure("users", "kelas", "kelas TEXT")
  ensure("templates", "subject", "subject TEXT")
  ensure("templates", "grade_level", "grade_level TEXT")
  ensure("templates", "cover_image", "cover_image TEXT")
  ensure("templates", "clone_count", "clone_count INTEGER DEFAULT 0")
  ensure("rooms_archive", "mode", "mode TEXT")
  ensure("rooms_archive", "settings", "settings TEXT")
  ensure("rooms_archive", "started_at", "started_at DATETIME")
}

/** Isi 6 akun demo bila boleh (lihat shouldSeedDemoUsers) & tabel masih kosong. */
function seedDemoUsers(database) {
  if (!shouldSeedDemoUsers()) return

  const { total } = database.prepare("SELECT COUNT(*) AS total FROM users").get()
  if (total > 0) return

  const insert = database.prepare(
    "INSERT INTO users (name, role, kelas, pin_hash) VALUES (?, ?, ?, ?)"
  )
  for (const demo of DEMO_USERS) {
    insert.run(demo.name, demo.role, demo.kelas, hashPin(DEMO_PIN))
  }
}

// Satu instance per path. Map di globalThis supaya hot-reload dev maupun
// beberapa path (dipakai self-test) tidak saling menimpa.
const globalForDb = globalThis
if (!globalForDb.__liveQuizDbs) globalForDb.__liveQuizDbs = new Map()
const registry = globalForDb.__liveQuizDbs

if (!registry.has(DB_PATH)) {
  registry.set(DB_PATH, createDb())
}
export const db = registry.get(DB_PATH)

// ═══════════════════════════════════════════════════════════════════════════
// PEMETAAN BARIS → BENTUK PUBLIK (camelCase, tanpa kolom rahasia)
// ═══════════════════════════════════════════════════════════════════════════
// `pin_hash` TIDAK PERNAH keluar dari modul ini. Semua route memakai mapper
// di bawah, jadi tidak ada jalur yang bisa membocorkan hash.

export function toUser(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    kelas: row.kelas ?? null,
    createdAt: row.created_at ?? null,
  }
}

/** Baca JSON dengan aman — kolom rusak tidak boleh menjatuhkan route. */
export function parseJsonColumn(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") return fallback
  try {
    const parsed = JSON.parse(value)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

export function toTemplate(row) {
  if (!row) return null
  return {
    id: row.id,
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? null,
    title: row.title,
    description: row.description ?? "",
    category: row.category ?? null,
    subject: row.subject ?? null,
    gradeLevel: row.grade_level ?? null,
    tags: parseJsonColumn(row.tags, []),
    coverImage: row.cover_image ?? null,
    visibility: row.visibility,
    cloneCount: row.clone_count ?? 0,
    settings: parseJsonColumn(row.settings, null),
    questions: parseJsonColumn(row.questions, []),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

export function toUpload(row) {
  if (!row) return null
  return {
    id: row.id,
    ownerId: row.owner_id ?? null,
    ext: row.ext,
    bytes: row.bytes,
    createdAt: row.created_at ?? null,
  }
}

/**
 * Bentuk `Template` yang dikirim ke klien (CONTRACT §5) — sama dengan
 * toTemplate(), plus field `mine` yang dihitung untuk penonton tertentu.
 *
 * Menerima objek HASIL toTemplate() (bukan baris mentah), supaya pemetaan
 * kolom→camelCase hanya terjadi di satu tempat: toTemplate().
 *
 * `mine` tidak bisa dihitung di SQL dengan rapi (butuh identitas penonton),
 * jadi sengaja dikerjakan di sini daripada diulang di empat route. Field itu
 * dipakai UI untuk memunculkan tombol Ubah/Hapus/Clone.
 *
 * @param {object} template — keluaran toTemplate()
 * @param {number|string|null} viewerId — id user penonton (null = anonim)
 */
export function viewTemplate(template, viewerId = null) {
  if (!template) return null
  return {
    ...template,
    mine:
      viewerId !== null && viewerId !== undefined && Number(template.ownerId) === Number(viewerId),
  }
}

export function toArchivedRoom(row) {
  if (!row) return null
  return {
    code: row.code,
    hostUser: row.host_user ?? null,
    title: row.title ?? null,
    mode: row.mode ?? null,
    settings: parseJsonColumn(row.settings, null),
    summary: parseJsonColumn(row.summary, null),
    playerCount: row.player_count ?? 0,
    startedAt: row.started_at ?? null,
    endedAt: row.ended_at ?? null,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — USERS
// ═══════════════════════════════════════════════════════════════════════════

/** Cari user berdasarkan nama (case-insensitive, sesuai COLLATE NOCASE). */
export function findUserByName(name) {
  return db
    .prepare(
      `SELECT id, name, role, kelas, pin_hash, created_at
       FROM users WHERE name = ?`
    )
    .get(String(name ?? "").trim()) ?? null
}

/** User TANPA pin_hash — aman dikirim ke klien. */
export function findUserById(id) {
  return toUser(
    db
      .prepare("SELECT id, name, role, kelas, created_at FROM users WHERE id = ?")
      .get(id) ?? null
  )
}

/**
 * Buat user baru.
 * @param {{ name: string, role: string, kelas?: string|null, pinHash: string }} input
 * @returns {{ id: number, user: object }} user baru (tanpa pin_hash)
 */
export function createUser({ name, role, kelas, pinHash }) {
  const result = db
    .prepare("INSERT INTO users (name, role, kelas, pin_hash) VALUES (?, ?, ?, ?)")
    .run(name, role, kelas ?? null, pinHash)
  const id = Number(result.lastInsertRowid)
  return { id, user: findUserById(id) }
}

/** Semua user (untuk halaman admin) — terurut nama, tanpa pin_hash. */
export function listUsers() {
  return db
    .prepare(
      `SELECT id, name, role, kelas, created_at
       FROM users ORDER BY name COLLATE NOCASE ASC`
    )
    .all()
    .map(toUser)
}

export function deleteUser(id) {
  return db.prepare("DELETE FROM users WHERE id = ?").run(id)
}

export function setUserPin(id, pinHash) {
  return db.prepare("UPDATE users SET pin_hash = ? WHERE id = ?").run(pinHash, id)
}

export function updateUserName(id, name) {
  return db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, id)
}

export function countUsers() {
  return db.prepare("SELECT COUNT(*) AS total FROM users").get().total
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — SESSIONS
// ═══════════════════════════════════════════════════════════════════════════

export function createSession(token, userId, ttlDays) {
  return db
    .prepare(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES (?, ?, datetime('now', '+${Number(ttlDays)} days'))`
    )
    .run(token, userId)
}

/** User pemilik token — null bila token tidak ada ATAU sudah kedaluwarsa. */
export function getSessionUser(token) {
  if (!token) return null
  return toUser(
    db
      .prepare(
        `SELECT u.id, u.name, u.role, u.kelas, u.created_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.expires_at > datetime('now')`
      )
      .get(token) ?? null
  )
}

export function deleteSession(token) {
  if (!token) return { changes: 0 }
  return db.prepare("DELETE FROM sessions WHERE token = ?").run(token)
}

/** Buang semua sesi milik satu user — dipakai setelah ganti PIN. */
export function deleteSessionsForUser(userId) {
  return db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId)
}

/** Sapu sesi kedaluwarsa — dipanggil lazy dari endpoint auth, bukan timer. */
export function pruneSessions() {
  return db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run()
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const TEMPLATE_SELECT = `
  SELECT t.*, u.name AS owner_name
  FROM templates t LEFT JOIN users u ON u.id = t.owner_id
`

/**
 * Daftar template dengan filter opsional.
 * @param {{ ownerId?: number, q?: string, category?: string, subject?: string,
 *           gradeLevel?: string, tag?: string, publicOnly?: boolean }} [filter]
 */
export function listTemplates(filter = {}) {
  const where = []
  const args = []

  if (filter.publicOnly) {
    where.push("t.visibility = 'public'")
  }
  if (filter.ownerId != null) {
    where.push("t.owner_id = ?")
    args.push(filter.ownerId)
  }
  if (filter.category) {
    where.push("t.category = ?")
    args.push(filter.category)
  }
  if (filter.subject) {
    where.push("t.subject = ?")
    args.push(filter.subject)
  }
  if (filter.gradeLevel) {
    where.push("t.grade_level = ?")
    args.push(filter.gradeLevel)
  }
  if (filter.tag) {
    // tags disimpan sebagai JSON array string ("[\"a\",\"b\"]"). Pencocokan
    // tag dilakukan lewat LIKE terhadap bentuk JSON-nya — cukup untuk daftar
    // kecil, dan tidak butuh tabel relasi terpisah. Tanda kutip di sekitar tag
    // mencegah "mat" ikut cocok dengan "matematika".
    //
    // Wildcard LIKE (`%`, `_`) dan karakter escape di-escape dengan `\` dan
    // diikat ESCAPE '\' supaya tag "%" tidak mencocokkan semua.
    const safe = String(filter.tag).replace(/[\\%_"]/g, (ch) => `\\${ch}`)
    where.push("COALESCE(t.tags, '') LIKE ? ESCAPE '\\'")
    args.push(`%"${safe}"%`)
  }
  if (filter.q) {
    // LIKE dengan wildcard di kedua sisi — pencarian sederhana sudah cukup,
    // dan indeks tetap dipakai untuk filter owner/visibility di atasnya.
    const like = `%${String(filter.q).trim()}%`
    where.push(
      "(t.title LIKE ? OR COALESCE(t.description, '') LIKE ? OR COALESCE(t.subject, '') LIKE ? OR COALESCE(t.tags, '') LIKE ?)"
    )
    args.push(like, like, like, like)
  }

  const sql = `${TEMPLATE_SELECT}
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY t.updated_at DESC, t.id DESC
    LIMIT 200`

  return db.prepare(sql).all(...args).map(toTemplate)
}

/** Satu template (bentuk publik) berdasarkan id, atau null. */
export function getTemplate(id) {
  return toTemplate(findTemplateRow(id))
}

/** Baris MENTAH satu template — dipakai route yang butuh owner_id misalnya. */
export function findTemplateRow(id) {
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) return null
  return db.prepare(`${TEMPLATE_SELECT} WHERE t.id = ?`).get(numericId) ?? null
}

/**
 * Simpan template baru.
 * @param {object} input — sudah divalidasi validateTemplateInput()
 * @returns {number} id template baru
 */
export function insertTemplate(input) {
  const result = db
    .prepare(
      `INSERT INTO templates
         (owner_id, title, description, category, subject, grade_level, tags,
          cover_image, visibility, settings, questions, clone_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      input.ownerId,
      input.title,
      input.description ?? null,
      input.category ?? null,
      input.subject ?? null,
      input.gradeLevel ?? null,
      JSON.stringify(input.tags ?? []),
      input.coverImage ?? null,
      input.visibility ?? "private",
      JSON.stringify(input.settings ?? {}),
      JSON.stringify(input.questions ?? [])
    )
  return Number(result.lastInsertRowid)
}

/**
 * Perbarui template — hanya field yang benar-benar dikirim yang ditulis.
 * `updated_at` selalu digeser supaya daftar "terbaru dulu" tetap benar.
 *
 * @param {number} id
 * @param {object} fields — kunci camelCase (title, description, category, …)
 */
export function updateTemplate(id, fields) {
  const columnOf = {
    title: "title",
    description: "description",
    category: "category",
    subject: "subject",
    gradeLevel: "grade_level",
    coverImage: "cover_image",
    visibility: "visibility",
  }
  const sets = []
  const args = []

  for (const [key, column] of Object.entries(columnOf)) {
    if (fields[key] === undefined) continue
    // `undefined` tidak ditulis; `null` DITULIS sebagai NULL — itu cara
    // mengosongkan deskripsi/sampul lewat PUT.
    sets.push(`${column} = ?`)
    args.push(fields[key])
  }
  if (fields.tags !== undefined) {
    sets.push("tags = ?")
    args.push(JSON.stringify(fields.tags))
  }
  if (fields.settings !== undefined) {
    sets.push("settings = ?")
    args.push(JSON.stringify(fields.settings))
  }
  if (fields.questions !== undefined) {
    sets.push("questions = ?")
    args.push(JSON.stringify(fields.questions))
  }

  sets.push("updated_at = CURRENT_TIMESTAMP")
  args.push(id)

  return db.prepare(`UPDATE templates SET ${sets.join(", ")} WHERE id = ?`).run(...args)
}

export function deleteTemplate(id) {
  return db.prepare("DELETE FROM templates WHERE id = ?").run(id)
}

export function incrementCloneCount(id) {
  return db
    .prepare("UPDATE templates SET clone_count = COALESCE(clone_count, 0) + 1 WHERE id = ?")
    .run(id)
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — UPLOADS
// ═══════════════════════════════════════════════════════════════════════════

export function insertUpload({ id, ownerId, ext, bytes }) {
  return db
    .prepare("INSERT INTO uploads (id, owner_id, ext, bytes) VALUES (?, ?, ?, ?)")
    .run(id, ownerId ?? null, ext, bytes)
}

export function getUpload(id) {
  return toUpload(db.prepare("SELECT * FROM uploads WHERE id = ?").get(id) ?? null)
}

export function countUploadsByOwner(ownerId) {
  return db
    .prepare("SELECT COUNT(*) AS total FROM uploads WHERE owner_id = ?")
    .get(ownerId).total
}

/** Semua unggahan milik satu akun, terbaru lebih dulu. */
export function listUploadsByOwner(ownerId) {
  return db
    .prepare("SELECT * FROM uploads WHERE owner_id = ? ORDER BY created_at DESC, id DESC")
    .all(ownerId)
    .map(toUpload)
}

/**
 * Hapus baris unggahan milik pemilik tertentu.
 * @returns {boolean} true bila ada baris yang benar-benar terhapus
 *
 * owner_id WAJIB ikut di WHERE: tanpa itu, siapa pun yang menebak id berkas
 * bisa menghapus gambar orang lain.
 */
export function deleteUploadForOwner(id, ownerId) {
  const result = db
    .prepare("DELETE FROM uploads WHERE id = ? AND owner_id = ?")
    .run(id, ownerId)
  return result.changes > 0
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY — ARSIP ROOM
// ═══════════════════════════════════════════════════════════════════════════
// Kode room adalah PRIMARY KEY, jadi satu kode hanya punya satu baris arsip.
// Sesi yang di-restart lalu diakhiri lagi akan MENIMPA arsip lamanya (upsert)
// — lebih benar daripada menumpuk baris dengan kode sama.

export function archiveRoom({
  code,
  hostUser,
  title,
  mode,
  settings,
  summary,
  playerCount,
  startedAt,
}) {
  return db
    .prepare(
      `INSERT INTO rooms_archive
         (code, host_user, title, mode, settings, summary, player_count, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(code) DO UPDATE SET
         host_user    = excluded.host_user,
         title        = excluded.title,
         mode         = excluded.mode,
         settings     = excluded.settings,
         summary      = excluded.summary,
         player_count = excluded.player_count,
         started_at   = excluded.started_at,
         ended_at     = CURRENT_TIMESTAMP`
    )
    .run(
      code,
      hostUser ?? null,
      title ?? null,
      mode ?? null,
      JSON.stringify(settings ?? null),
      JSON.stringify(summary ?? null),
      playerCount ?? 0,
      startedAt ?? null
    )
}

/** Arsip milik satu host (atau semua arsip bila hostUser dibiarkan kosong). */
export function listArchivedRooms(hostUser) {
  if (hostUser == null) {
    return db
      .prepare("SELECT * FROM rooms_archive ORDER BY ended_at DESC LIMIT 200")
      .all()
      .map(toArchivedRoom)
  }
  return db
    .prepare(
      "SELECT * FROM rooms_archive WHERE host_user = ? ORDER BY ended_at DESC LIMIT 200"
    )
    .all(hostUser)
    .map(toArchivedRoom)
}

export function getArchivedRoom(code) {
  return toArchivedRoom(
    db.prepare("SELECT * FROM rooms_archive WHERE code = ?").get(code) ?? null
  )
}

/**
 * Hapus satu arsip. `hostUser` opsional: bila diisi, hanya baris milik host
 * itu yang terhapus (dipakai agar guru tidak bisa menghapus arsip guru lain);
 * admin memanggil tanpa hostUser untuk menghapus apa pun.
 * @returns {boolean} true bila ada baris yang terhapus
 */
export function deleteArchivedRoom(code, hostUser = null) {
  const result =
    hostUser == null
      ? db.prepare("DELETE FROM rooms_archive WHERE code = ?").run(code)
      : db.prepare("DELETE FROM rooms_archive WHERE code = ? AND host_user = ?").run(code, hostUser)
  return result.changes > 0
}
