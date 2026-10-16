// ═══════════════════════════════════════════════════════════════════════════
// QUIZ TIMING — satu tempat untuk semua keputusan deadline
// ═══════════════════════════════════════════════════════════════════════════
// Fungsi murni: hanya membaca properti room/player/settings, tidak pernah
// memutasi. Dipisah dari quiz-store.js supaya aturan waktu mudah diaudit
// tanpa membaca seluruh mesin room.
// ═══════════════════════════════════════════════════════════════════════════

/** Durasi soal ke-`index`, dengan default settings sebagai jaring pengaman. */
export function questionTimeSec(room, index) {
  const question = room.questions[index]
  if (question && Number.isInteger(question.timeSec)) return question.timeSec
  return room.settings.defaultTimeSec
}

/**
 * Batas waktu soal untuk mode `live` (satu jam untuk semua orang):
 *   per-question/random → sekarang + durasi soal
 *   total               → jam bersama dihitung sejak kuis dimulai
 *   none                → null (tanpa batas; host yang menggerakkan)
 */
export function liveDeadline(room, now, index) {
  const timeMode = room.settings.timeMode
  if (timeMode === "none") return null
  if (timeMode === "total") {
    return (room.startedAt ?? now) + room.settings.totalTimeSec * 1000
  }
  return now + questionTimeSec(room, index) * 1000
}

/**
 * Batas waktu pemain untuk mode `exam` (jam per orang):
 *   per-question/random → sekarang + durasi soal ke-`player.index`
 *   total               → jam pribadi: startedAt + totalTimeSec (TIDAK di-reset
 *                         saat pindah soal — ini batas satu ujian penuh)
 *   none                → null
 */
export function deadlineForPlayer(room, player, now) {
  const timeMode = room.settings.timeMode
  if (timeMode === "none") return null
  if (timeMode === "total") {
    return (player.startedAt ?? now) + room.settings.totalTimeSec * 1000
  }
  if (player.index >= room.questions.length) return null
  return now + questionTimeSec(room, player.index) * 1000
}
