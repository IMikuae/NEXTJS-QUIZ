// ═══════════════════════════════════════════════════════════════════════════
// SCORING — rumus poin untuk satu jawaban
// ═══════════════════════════════════════════════════════════════════════════
// Rumus dipisah ke modul sendiri supaya:
//   1. mudah diuji terpisah (fungsi murni, tanpa akses ke state room),
//   2. mudah dijelaskan dan diubah tanpa menyentuh quiz-store.js.
//
// Poin = BASE_POINTS (kalau benar) + bonus kecepatan proporsional.
// Bonus kecepatan membuat pemain yang menjawab lebih cepat menang, tapi
// TIDAK pernah melebihi BASE_POINTS — jadi jawaban benar selalu bernilai
// minimal 1000 dan maksimal 2000, tidak peduli secepat apa pun.
// ═══════════════════════════════════════════════════════════════════════════

/** Poin dasar untuk jawaban benar (tanpa bonus kecepatan). */
export const BASE_POINTS = 1000

/** Bonus maksimum yang bisa didapat dari kecepatan menjawab. */
export const SPEED_BONUS_MAX = 1000

/**
 * Hitung poin untuk satu jawaban.
 *
 * @param {object} input
 * @param {boolean} input.correct     apakah jawaban benar
 * @param {number}  input.remainingMs sisa waktu saat menjawab (ms)
 * @param {number}  input.totalMs     total durasi soal (ms)
 * @returns {number} poin (0 bila salah)
 */
export function scoreFor({ correct, remainingMs, totalMs }) {
  if (!correct) return 0
  // Rasio dibatasi 0..1 supaya clock yang aneh atau sisa waktu negatif
  // tidak pernah menghasilkan poin di luar rentang wajar.
  const ratio = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0
  return BASE_POINTS + Math.round(SPEED_BONUS_MAX * ratio)
}

/**
 * Hitung peringkat dari daftar skor.
 * Pemain dengan skor sama mendapat peringkat yang sama (dense ranking),
 * dan urutan akhir dirapikan berdasarkan skor menurun.
 *
 * @param {Array<{ id: string, name: string, score: number }>} players
 * @returns {Array<{ playerId: string, name: string, score: number, rank: number }>}
 */
export function buildLeaderboard(players) {
  const sorted = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // Tie-break stabil: yang lebih dulu bergabung tampil lebih dulu.
    return (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  })

  let lastScore = null
  let lastRank = 0
  return sorted.map((player, index) => {
    const rank = player.score === lastScore ? lastRank : index + 1
    lastScore = player.score
    lastRank = rank
    return {
      playerId: player.id,
      name: player.name,
      score: player.score,
      rank,
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// MODE UJIAN (scoringMode) — tambahan v2
// ═══════════════════════════════════════════════════════════════════════════
// Empat fungsi di bawah ini adalah SATU-SATUNYA tambahan pada modul ini.
// scoreFor() dan buildLeaderboard() di atas TIDAK disentuh sama sekali karena
// sudah dipakai UI mode live dan bentuk keluarannya dikunci kontrak.
//
// Bedanya mode ujian: TIDAK ada bonus kecepatan. Satu jawaban benar tetap
// bernilai 1 poin, dan nilai akhir adalah persentase benar dari SELURUH soal
// (soal yang tidak dijawab ikut jadi penyebut). Alasannya pedagogis: ujian
// mengukur penguasaan, bukan kecepatan refleks.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Poin satu jawaban MENURUT scoringMode room.
 *
 * @param {object} input
 * @param {boolean} input.correct
 * @param {number}  input.remainingMs
 * @param {number}  input.totalMs
 * @param {string}  [input.scoringMode] "competitive" (default) | "exam"
 * @returns {number}
 */
export function scoreForMode({ correct, remainingMs, totalMs, scoringMode }) {
  if (scoringMode === "exam") return correct ? 1 : 0
  return scoreFor({ correct, remainingMs, totalMs })
}

/**
 * Nilai 0–100 dari jumlah benar.
 * @param {number} correct
 * @param {number} total
 * @returns {number}
 */
export function gradeFor(correct, total) {
  if (!Number.isFinite(total) || total <= 0) return 0
  const safeCorrect = Number.isFinite(correct) ? Math.max(0, correct) : 0
  return Math.round((safeCorrect / total) * 100)
}

/**
 * Ringkas hasil satu pemain menjadi bentuk yang dipakai `results.perPlayer`.
 *
 * `answers` = daftar jawaban pemain: `{ questionIndex, optionIndex, correct }`.
 * Yang TIDAK ada di sana dihitung sebagai "tidak menjawab" — ini yang membuat
 * soal terlewat (kehabisan waktu di mode exam) tetap terhitung di penyebut.
 *
 * @param {object} input
 * @param {string} input.playerId
 * @param {string} input.name
 * @param {number} input.score
 * @param {Array<{correct: boolean}>} input.answers
 * @param {number} input.totalQuestions
 * @param {number} [input.passingScore]
 * @param {number} [input.secondsUsed]
 * @returns {object}
 */
export function summarizePlayer({
  playerId,
  name,
  score,
  answers,
  totalQuestions,
  passingScore = 70,
  secondsUsed = 0,
}) {
  const rows = Array.isArray(answers) ? answers : []
  const total = Number.isFinite(totalQuestions) ? Math.max(0, totalQuestions) : 0

  let correct = 0
  let wrong = 0
  for (const answer of rows) {
    if (answer?.correct) correct += 1
    else wrong += 1
  }
  // Soal yang tidak pernah dijawab = sisa dari total. Bisa negatif kalau data
  // tidak konsisten (mis. total berubah) — dijepit ke 0 supaya laporan tidak
  // pernah menampilkan angka mustahil.
  const unanswered = Math.max(0, total - correct - wrong)

  const grade = gradeFor(correct, total)
  const safePassing = Number.isFinite(passingScore) ? passingScore : 70
  const safeSeconds = Number.isFinite(secondsUsed) ? Math.max(0, Math.round(secondsUsed)) : 0

  return {
    playerId,
    name,
    correct,
    wrong,
    unanswered,
    total,
    score: Number.isFinite(score) ? score : 0,
    grade,
    passed: grade >= safePassing,
    secondsUsed: safeSeconds,
  }
}

/**
 * Dense ranking untuk daftar hasil.
 *
 * Tie-break (dalam urutan prioritas): skor lebih tinggi → waktu lebih cepat →
 * nama A–Z. Pemain dengan skor SAMA mendapat peringkat sama walau waktunya
 * berbeda, jadi "seri" tidak pernah dipecah oleh peringkat.
 *
 * @param {Array<object>} rows — keluaran summarizePlayer()
 * @returns {Array<object>} salinan baru, terurut, dengan field `rank`
 */
export function rankSummaries(rows) {
  const list = Array.isArray(rows) ? rows : []
  const sorted = [...list].sort((a, b) => {
    if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0)
    if ((a.secondsUsed ?? 0) !== (b.secondsUsed ?? 0)) {
      return (a.secondsUsed ?? 0) - (b.secondsUsed ?? 0)
    }
    return String(a.name ?? "").localeCompare(String(b.name ?? ""), "id")
  })

  let lastScore = null
  let lastRank = 0
  return sorted.map((row, index) => {
    const rank = row.score === lastScore ? lastRank : index + 1
    lastScore = row.score
    lastRank = rank
    return { ...row, rank }
  })
}
