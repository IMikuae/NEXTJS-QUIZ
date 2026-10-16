import * as db from "../../src/lib/db.js"
import { hashPin, verifyPin } from "../../src/lib/auth.js"
// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("4. db.js (file DB sementara)")

test("seed akun demo berjalan sekali (6 akun, PIN 123456)", async () => {
  const users = db.listUsers()
  assert.equal(users.length, 6)
  const names = users.map((u) => u.name)
  assert.ok(names.includes("Admin Yue"))
  assert.ok(names.includes("Bu Rina"))
  assert.ok(names.includes("Nina"))

  const admin = db.findUserByName("Admin Yue")
  assert.equal(admin.role, "admin")
  assert.equal(admin.kelas, null)

  const budi = db.findUserByName("Budi")
  assert.equal(budi.role, "siswa")
  assert.equal(budi.kelas, "7A")

  // pin_hash ada di baris mentah tapi TIDAK PERNAH keluar lewat mapper.
  assert.match(admin.pin_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/)
  assert.equal(db.findUserById(budi.id).pin_hash, undefined)
  assert.equal(JSON.stringify(db.listUsers()).includes("pin_hash"), false)
})

test("user: buat, baca, ganti nama, ganti PIN, hapus", async () => {
  const { hashPin, verifyPin } = await import("../src/lib/auth.js")

  const created = db.createUser({
    name: "Test Siswa",
    role: "siswa",
    kelas: "9B",
    pinHash: hashPin("654321"),
  })
  assert.ok(created.id > 0)
  assert.equal(created.user.name, "Test Siswa")
  assert.equal(created.user.kelas, "9B")

  const found = db.findUserByName("test siswa") // COLLATE NOCASE
  assert.equal(found.id, created.id)
  assert.equal(verifyPin("654321", found.pin_hash), true)
  assert.equal(verifyPin("000000", found.pin_hash), false)

  db.updateUserName(created.id, "Test Siswa Dua")
  assert.equal(db.findUserById(created.id).name, "Test Siswa Dua")

  db.setUserPin(created.id, hashPin("111111"))
  assert.equal(verifyPin("111111", db.findUserByName("Test Siswa Dua").pin_hash), true)

  assert.equal(db.countUsers(), 7)
  db.deleteUser(created.id)
  assert.equal(db.findUserByName("Test Siswa Dua"), null)
  assert.equal(db.countUsers(), 6)
})

test("sessions: buat, baca, hapus", async () => {
  const admin = db.findUserByName("Bu Rina")
  const token = "a".repeat(64)

  db.createSession(token, admin.id, 30)
  const sessionUser = db.getSessionUser(token)
  assert.equal(sessionUser.id, admin.id)
  assert.equal(sessionUser.name, "Bu Rina")
  assert.equal(sessionUser.pin_hash, undefined)

  assert.equal(db.getSessionUser("tidak-ada"), null)
  assert.equal(db.getSessionUser(null), null)

  db.deleteSession(token)
  assert.equal(db.getSessionUser(token), null)
})

test("templates: tulis lalu baca kembali (semua field sama)", async () => {
  const owner = db.findUserByName("Bu Rina")

  const input = {
    ownerId: owner.id,
    title: "Pecahan & Akar",
    description: "Latihan bab 3",
    category: "Matematika",
    subject: "Matematika",
    gradeLevel: "8A",
    tags: ["pecahan", "akar"],
    coverImage: "/api/uploads/" + "d".repeat(32) + ".png",
    visibility: "public",
    settings: { mode: "exam", timeMode: "total", totalTimeSec: 900, passingScore: 75 },
    questions: [
      {
        text: "3/4 + 1/8 = ?",
        options: ["7/8", "1/2", "4/12", "3/2"],
        correctIndex: 0,
        timeSec: 30,
        image: null,
        optionImages: [null, null, null, null],
        explanation: "Samakan penyebut.",
      },
    ],
  }

  const id = db.insertTemplate(input)
  assert.ok(id > 0)

  const template = db.getTemplate(id)
  assert.equal(template.title, input.title)
  assert.equal(template.ownerId, owner.id)
  assert.equal(template.ownerName, "Bu Rina")
  assert.equal(template.visibility, "public")
  assert.deepEqual(template.tags, ["pecahan", "akar"])
  assert.deepEqual(template.settings, input.settings)
  assert.deepEqual(template.questions, input.questions)
  assert.equal(template.cloneCount, 0)

  // `mine` dihitung per penonton.
  assert.equal(db.viewTemplate(template, owner.id).mine, true)
  assert.equal(db.viewTemplate(template, 999).mine, false)
  assert.equal(db.viewTemplate(template, null).mine, false)

  // Daftar publik hanya berisi yang public.
  const publicList = db.listTemplates({ publicOnly: true })
  assert.equal(publicList.length, 1)
  assert.equal(publicList[0].id, id)

  // Filter pemilik & pencarian.
  assert.equal(db.listTemplates({ ownerId: owner.id }).length, 1)
  assert.equal(db.listTemplates({ ownerId: 999 }).length, 0)
  assert.equal(db.listTemplates({ publicOnly: true, q: "Pecahan" }).length, 1)
  assert.equal(db.listTemplates({ publicOnly: true, q: "TidakAda" }).length, 0)
  assert.equal(db.listTemplates({ publicOnly: true, category: "Matematika" }).length, 1)
  assert.equal(db.listTemplates({ publicOnly: true, category: "IPA" }).length, 0)

  // Filter metadata baru: subject / gradeLevel / tag / pencarian di tags.
  assert.equal(db.listTemplates({ publicOnly: true, subject: "Matematika" }).length, 1)
  assert.equal(db.listTemplates({ publicOnly: true, subject: "Fisika" }).length, 0)
  assert.equal(db.listTemplates({ publicOnly: true, gradeLevel: "8A" }).length, 1)
  assert.equal(db.listTemplates({ publicOnly: true, gradeLevel: "9B" }).length, 0)
  assert.equal(db.listTemplates({ publicOnly: true, tag: "akar" }).length, 1)
  assert.equal(db.listTemplates({ publicOnly: true, tag: "mat" }).length, 0, "tag harus cocok utuh, bukan sebagian")
  assert.equal(db.listTemplates({ publicOnly: true, q: "akar" }).length, 1, "q ikut mencari di tags")
  assert.equal(db.listTemplates({ publicOnly: true, q: "Fisika" }).length, 0)

  // Update sebagian: hanya field yang dikirim yang berubah.
  db.updateTemplate(id, { title: "Pecahan & Akar (Revisi)", visibility: "private" })
  const updated = db.getTemplate(id)
  assert.equal(updated.title, "Pecahan & Akar (Revisi)")
  assert.equal(updated.visibility, "private")
  assert.equal(updated.description, "Latihan bab 3") // tidak disentuh
  assert.deepEqual(updated.questions, input.questions)

  // Privat → tidak muncul di daftar publik.
  assert.equal(db.listTemplates({ publicOnly: true }).length, 0)

  db.incrementCloneCount(id)
  db.incrementCloneCount(id)
  assert.equal(db.getTemplate(id).cloneCount, 2)

  db.deleteTemplate(id)
  assert.equal(db.getTemplate(id), null)
})

test("uploads: catat + hitung per pemilik", async () => {
  const owner = db.findUserByName("Budi")
  const id = "e".repeat(32)

  db.insertUpload({ id, ownerId: owner.id, ext: "png", bytes: 1234 })
  const row = db.getUpload(id)
  assert.equal(row.id, id)
  assert.equal(row.ownerId, owner.id)
  assert.equal(row.ext, "png")
  assert.equal(row.bytes, 1234)
  assert.equal(db.countUploadsByOwner(owner.id), 1)
  assert.equal(db.countUploadsByOwner(99999), 0)
  assert.equal(db.getUpload("tidak-ada"), null)
})

test("arsip room: tulis, baca, dan timpa (upsert)", async () => {
  const host = db.findUserByName("Bu Rina")

  db.archiveRoom({
    code: "ABC123",
    hostUser: host.id,
    title: "Kuis Bab 3",
    mode: "exam",
    settings: { mode: "exam", passingScore: 70 },
    summary: { results: { averageGrade: 78.5, perPlayer: [] }, report: { totalPlayers: 2 } },
    playerCount: 2,
    startedAt: "2026-09-26 10:00:00",
  })

  const archived = db.getArchivedRoom("ABC123")
  assert.equal(archived.code, "ABC123")
  assert.equal(archived.hostUser, host.id)
  assert.equal(archived.title, "Kuis Bab 3")
  assert.equal(archived.mode, "exam")
  assert.equal(archived.playerCount, 2)
  assert.equal(archived.settings.passingScore, 70)
  assert.equal(archived.summary.results.averageGrade, 78.5)

  const list = db.listArchivedRooms(host.id)
  assert.equal(list.length, 1)
  assert.equal(list[0].code, "ABC123")
  assert.equal(db.listArchivedRooms(999).length, 0)

  // Kode sama → baris ditimpa, bukan ditambah.
  db.archiveRoom({
    code: "ABC123",
    hostUser: host.id,
    title: "Kuis Bab 3 (ulang)",
    mode: "live",
    settings: {},
    summary: null,
    playerCount: 3,
    startedAt: "2026-09-26 11:00:00",
  })
  const list2 = db.listArchivedRooms(host.id)
  assert.equal(list2.length, 1)
  assert.equal(list2[0].title, "Kuis Bab 3 (ulang)")
  assert.equal(list2[0].playerCount, 3)
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. QUIZ STORE — MODE EXAM + UJI ANTI-BOCOR
// ═══════════════════════════════════════════════════════════════════════════
