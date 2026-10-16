// ═══════════════════════════════════════════════════════════════════════════
// QUIZ DERIVE — nilai turunan dari state room (distribusi, rekap, hasil)
// ═══════════════════════════════════════════════════════════════════════════
// Semua fungsi di sini MURNI terhadap state: hanya membaca, tidak pernah
// memutasi room. Dipisah dari quiz-store.js supaya aturan turunan (termasuk
// aturan anti-bocor skor/peringkat) bisa diaudit tanpa membaca mesin room.
//
// Impor hanya dari modul murni (scoring.js, quiz-validate.js) — aman untuk
// diuji di luar Next.
// ═══════════════════════════════════════════════════════════════════════════

import { rankSummaries, summarizePlayer } from "./scoring.js"
import { OPTION_COUNT } from "./quiz-validate.js"

/** Jumlah pemilih per opsi untuk satu soal: [n,n,n,n]. */
export function distributionFor(room, questionIndex) {
  const dist = new Array(OPTION_COUNT).fill(0)
  const prefix = `${questionIndex}:`
  for (const [key, answer] of room.answers) {
    if (!key.startsWith(prefix)) continue
    if (answer.optionIndex >= 0 && answer.optionIndex < OPTION_COUNT) {
      dist[answer.optionIndex] += 1
    }
  }
  return dist
}

/** Berapa pemain yang sudah menjawab soal tertentu. */
export function answeredCountFor(room, questionIndex) {
  const prefix = `${questionIndex}:`
  let count = 0
  for (const key of room.answers.keys()) {
    if (key.startsWith(prefix)) count += 1
  }
  return count
}

/** Daftar id pemain yang sudah menjawab soal tertentu (untuk badge di host). */
export function answeredIdsFor(room, questionIndex) {
  const prefix = `${questionIndex}:`
  const ids = []
  for (const key of room.answers.keys()) {
    if (key.startsWith(prefix)) ids.push(key.slice(prefix.length))
  }
  return ids
}

/** Berapa jawaban yang sudah dikirim satu pemain (semua soal). */
export function answeredByPlayer(room, playerId) {
  const suffix = `:${playerId}`
  let count = 0
  for (const key of room.answers.keys()) {
    if (key.endsWith(suffix)) count += 1
  }
  return count
}

/**
 * Berapa soal yang sudah "selesai" bagi seorang pemain:
 *   exam → `player.index` (soal yang dikerjakan + yang habis waktu)
 *   live (finished) → seluruh soal
 *   live (berjalan) → soal yang sudah dibahas (0..currentIndex)
 */
export function completedCountFor(room, player) {
  const total = room.questions.length
  if (room.mode === "exam") return Math.min(player.index, total)
  if (room.phase === "finished") return total
  return Math.max(0, Math.min(room.currentIndex + 1, total))
}

/**
 * Rekap jawaban seorang pemain: benar / salah / tidak dijawab.
 * Dipakai untuk `tally` di balasan /answer dan untuk ringkasan hasil.
 */
export function tallyFor(room, player) {
  const completed = completedCountFor(room, player)
  let correct = 0
  let wrong = 0

  for (let index = 0; index < completed; index += 1) {
    const answer = room.answers.get(`${index}:${player.id}`)
    if (!answer) continue
    if (answer.correct) correct += 1
    else wrong += 1
  }

  return { correct, wrong, unanswered: Math.max(0, completed - correct - wrong) }
}

/**
 * Skor yang boleh dilihat PEMILIK skor itu sendiri.
 *
 * ATURAN KEBOCORAN — sama kelasnya dengan `tally` dan `score` di balasan
 * /answer, dan justru inilah jalur yang paling mudah dipakai curang karena
 * `progress.score` ikut di SETIAP polling `GET /state`:
 *
 * Dengan `scoringMode: "exam"`, skor naik TEPAT SATU pada jawaban benar dan
 * tidak bergerak pada jawaban salah. Di mode `exam` dengan `instantFeedback`
 * dan `showExplanation` keduanya mati, itu artinya seorang pemain cukup
 * mencatat angka ini sebelum dan sesudah menjawab untuk tahu benar/salah —
 * tanpa DevTools Network sekalipun, cukup dari layar "Skor N" yang memang
 * sengaja kita tampilkan. Menyembunyikan `correct` di balasan /answer jadi
 * sia-sia kalau angka yang sama bocor lewat pintu lain.
 *
 * Karena itu: di mode `exam` dengan umpan balik mati, angka ini DIBEKUKAN di 0
 * sampai ujian pemain itu selesai. Pada saat `finishedAt !== null` ia ikut
 * lagi — dan pada titik itu hasil lengkapnya memang sudah terbuka di
 * `results`, jadi tidak ada lagi yang bisa dibocorkan.
 *
 * Mode `live` TIDAK dibekukan: di sana kunci jawaban memang sudah terbuka di
 * fase reveal, dan papan skor berjalan adalah inti permainannya.
 */
export function visibleScoreFor(room, player) {
  if (!player) return 0
  if (room.mode !== "exam") return player.score
  const reveal = room.settings.instantFeedback || room.settings.showExplanation
  if (reveal) return player.score
  // Skor peringkat tidak dipakai selama ujian berjalan; hasil akhirnya lengkap
  // di `results` begitu selesai.
  return player.finishedAt !== null ? player.score : 0
}

/**
 * Peringkat yang boleh dilihat pemiliknya.
 *
 * ATURAN KEBOCORAN — pasangan dari `visibleScoreFor`. Peringkat dihitung dari
 * skor MENTAH, jadi ia naik/turun persis ketika jawaban benar ditambahkan.
 * Kalau `you.rank` dikirim di mode `exam` dengan umpan balik mati, pemain cukup
 * mencatat peringkatnya sebelum & sesudah menjawab untuk menebak benar/salah —
 * kelas kebocoran yang sama dengan `tally`/`score` yang sudah ditutup.
 *
 * Karena itu peringkat disembunyikan (null) selama ujian pemain itu belum
 * selesai; begitu `finishedAt !== null`, hasil lengkapnya memang sudah terbuka
 * di `results`, jadi peringkat boleh ikut lagi.
 */
export function visibleRankFor(room, player, rank) {
  if (!player || rank === null || rank === undefined) return rank ?? null
  if (room.mode !== "exam") return rank
  const reveal = room.settings.instantFeedback || room.settings.showExplanation
  if (reveal) return rank
  return player.finishedAt !== null ? rank : null
}

/** Progres milik penonton sendiri — tidak pernah memuat data pemain lain. */
export function progressFor(room, player) {
  if (!player) {
    return { answered: 0, total: room.questions.length, score: 0 }
  }
  const answered =
    room.mode === "exam" ? Math.min(player.index, room.questions.length) : answeredByPlayer(room, player.id)
  return { answered, total: room.questions.length, score: visibleScoreFor(room, player) }
}

/** Berapa detik pemain itu menghabiskan waktunya di kuis ini. */
export function secondsUsedFor(room, player) {
  const start = player.startedAt ?? room.startedAt ?? room.createdAt
  const end =
    room.mode === "exam"
      ? player.finishedAt ?? room.endedAt ?? Date.now()
      : player.lastAnswerAt ?? room.endedAt ?? Date.now()
  return Math.max(0, Math.round((end - start) / 1000))
}

/** Susun baris hasil satu pemain (bentuk sama dengan results.perPlayer). */
export function summaryFor(room, player) {
  const answers = []
  for (let index = 0; index < room.questions.length; index += 1) {
    const answer = room.answers.get(`${index}:${player.id}`)
    if (answer) answers.push({ correct: Boolean(answer.correct) })
  }

  return summarizePlayer({
    playerId: player.id,
    name: player.name,
    score: player.score,
    answers,
    totalQuestions: room.questions.length,
    passingScore: room.settings.passingScore,
    secondsUsed: secondsUsedFor(room, player),
  })
}

/**
 * Hasil akhir lengkap. HANYA dipanggil saat fase `finished` — di dalamnya
 * `correctIndex` ikut terkirim (sudah publik pada fase itu).
 */
export function buildResults(room, viewerPlayer) {
  const passingScore = room.settings.passingScore
  const perPlayer = rankSummaries(
    Array.from(room.players.values(), (player) => summaryFor(room, player))
  )

  const perQuestion = room.questions.map((question, index) => {
    const optionCounts = distributionFor(room, index)
    const answeredCount = optionCounts.reduce((sum, value) => sum + value, 0)
    const correctCount = optionCounts[question.correctIndex] ?? 0
    return {
      index,
      text: question.text,
      correctIndex: question.correctIndex,
      // Penjelasan ikut di rekap akhir: pada fase `finished` kunci jawaban
      // sudah publik, jadi menampilkannya tidak membocorkan apa pun. Tanpa ini
      // layar pembahasan tidak punya apa-apa untuk ditampilkan.
      explanation: question.explanation ?? null,
      answeredCount,
      correctCount,
      correctPercent:
        answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      skipped: room.skippedIndexes.has(index),
      optionCounts,
    }
  })

  const averageGrade =
    perPlayer.length > 0
      ? Math.round(
          (perPlayer.reduce((sum, row) => sum + row.grade, 0) / perPlayer.length) * 10
        ) / 10
      : 0

  const myResult = viewerPlayer
    ? perPlayer.find((row) => row.playerId === viewerPlayer.id) ?? null
    : null

  return { passingScore, perPlayer, myResult, perQuestion, averageGrade }
}

/**
 * Pemain tercepat yang menjawab BENAR pada satu soal.
 * Kandidat: jawaban soal tsb dengan correct === true; pilih msTaken terkecil;
 * tie → `at` lebih awal. null bila tidak ada yang benar.
 */
export function fastestCorrectFor(room, questionIndex) {
  const prefix = `${questionIndex}:`
  let fastest = null
  for (const [key, answer] of room.answers) {
    if (!key.startsWith(prefix) || !answer.correct) continue
    if (
      fastest === null ||
      answer.msTaken < fastest.msTaken ||
      (answer.msTaken === fastest.msTaken && answer.at < fastest.at)
    ) {
      const playerId = key.slice(prefix.length)
      const name = room.players.get(playerId)?.name || "Pemain"
      fastest = { playerId, name, msTaken: answer.msTaken }
    }
  }
  return fastest
}

/**
 * Streak pemain: rentetan jawaban BENAR berurutan yang BERAKHIR di upToIndex.
 * Dipakai untuk badge 🔥 di umpan balik pemain (data milik viewer sendiri).
 */
export function streakFor(room, playerId, upToIndex) {
  let streak = 0
  for (let i = upToIndex; i >= 0; i -= 1) {
    const answer = room.answers.get(`${i}:${playerId}`)
    if (!answer || !answer.correct) break
    streak += 1
  }
  return streak
}

/**
 * Report kuis untuk host (hanya fase finished). Akurasi per soal + rata-rata.
 */
export function roomReportFor(room) {
  const players = Array.from(room.players.values())
  const totalPlayers = players.length
  const perQuestion = room.questions.map((question, index) => {
    const prefix = `${index}:`
    let answeredCount = 0
    let correctCount = 0
    for (const [key, answer] of room.answers) {
      if (!key.startsWith(prefix)) continue
      answeredCount += 1
      if (answer.correct) correctCount += 1
    }
    return {
      index,
      text: question.text,
      answeredCount,
      correctCount,
      correctPercent: answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0,
      skipped: room.skippedIndexes.has(index),
    }
  })

  const totalAnswered = perQuestion.reduce((sum, q) => sum + q.answeredCount, 0)
  const totalCorrect = perQuestion.reduce((sum, q) => sum + q.correctCount, 0)
  const averageScore =
    totalPlayers > 0
      ? Math.round(players.reduce((sum, p) => sum + p.score, 0) / totalPlayers)
      : 0

  return {
    totalPlayers,
    totalQuestions: room.questions.length,
    averageScore,
    totalAnswered,
    totalCorrect,
    accuracyPercent: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    perQuestion,
  }
}
