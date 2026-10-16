// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC STATE — SATU-SATUNYA PINTU KELUAR DATA KE CLIENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ██  ATURAN ANTI-CHEAT  ███████████████████████████████████████████████████
//
//  `correctIndex` TIDAK PERNAH boleh muncul di respons API sebelum fase
//  `reveal` atau `finished`. Kalau kunci jawaban bocor saat fase `question`,
//  siapa pun yang membuka DevTools bisa membaca jawaban benar sebelum
//  menjawab — seluruh permainan jadi tidak berarti.
//
//  Karena itu route `GET /api/rooms/{code}/state` TIDAK PERNAH mengembalikan
//  objek `room` mentah. Objek room memuat `questions[].correctIndex`; kalau
//  dikirim apa adanya, kunci jawaban ikut terkirim. Satu-satunya jalan keluar
//  adalah fungsi ini, dan fungsi ini hanya menyalin field yang aman.
//
//  Aturan praktisnya untuk siapa pun yang mengubah file ini nanti:
//    - Jangan pernah `return room` dari sebuah route.
//    - Jangan pernah menyebar (`...question`) objek soal ke respons;
//      sebut field-nya satu per satu seperti di bawah.
//    - `correctIndex` hanya boleh disalin di dalam blok
//      `phase === "reveal" || phase === "finished"` — dan di dalam
//      `results` yang juga hanya ada pada fase `finished`.
//
//  Satu pengecualian yang DISENGAJA ada di POST /api/rooms/{code}/answer,
//  bukan di sini — lihat komentar di submitAnswer() dan penjelasan di README.
//
// ███████████████████████████████████████████████████████████████████████████

import { buildLeaderboard } from "./scoring.js"
import {
  answeredByPlayer,
  answeredCountFor,
  answeredIdsFor,
  buildResults,
  distributionFor,
  fastestCorrectFor,
  progressFor,
  roomReportFor,
  streakFor,
  visibleRankFor,
  visibleScoreFor,
} from "./quiz-derive.js"

/**
 * Bangun objek state yang aman dikirim ke client.
 *
 * @param {object} room
 * @param {{ kind: "player", playerId: string } | { kind: "host" } | null} viewer
 * @returns {object}
 */
export function publicState(room, viewer = null) {
  const now = Date.now()
  const settings = room.settings
  const viewerPlayerId = viewer?.kind === "player" ? viewer.playerId : null
  const viewerPlayer = viewerPlayerId ? room.players.get(viewerPlayerId) || null : null

  // ── Soal mana yang relevan bagi PENONTON ────────────────────────────────
  // Mode exam: tiap pemain punya posisinya sendiri. Host/anonim melihat soal
  // yang sedang "ditunjuk" room (currentIndex) — host memang tidak menggerakkan
  // ujian, jadi angka itu hanya penanda, bukan kendali.
  const rawIndex =
    room.mode === "exam" && viewerPlayer ? viewerPlayer.index : room.currentIndex
  const clampedIndex = Math.max(0, Math.min(rawIndex, room.questions.length - 1))
  const questionIndex = room.questions.length > 0 ? clampedIndex : -1
  const question = questionIndex >= 0 ? room.questions[questionIndex] : null

  // Pemain mode exam yang sudah selesai tidak lagi punya soal aktif.
  const examDone = room.mode === "exam" && viewerPlayer !== null && viewerPlayer.finishedAt !== null
  const hasQuestion = (room.phase === "question" || room.phase === "reveal") && question !== null
  const isReveal = room.phase === "reveal" || room.phase === "finished"

  // ── Sisa waktu — jam MILIK PENONTON sendiri ─────────────────────────────
  let secondsLeft = null
  if (room.phase === "question") {
    const deadline =
      room.mode === "exam" ? (viewerPlayer ? viewerPlayer.deadline : null) : room.questionDeadline
    if (deadline !== null && deadline !== undefined) {
      secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000))
    }
  }

  // ── Batas waktu total (hanya timeMode "total") ──────────────────────────
  let totalSecondsLeft = null
  if (settings.timeMode === "total" && room.phase === "question") {
    const deadline =
      room.mode === "exam" ? (viewerPlayer ? viewerPlayer.deadline : null) : room.questionDeadline
    if (deadline !== null && deadline !== undefined) {
      totalSecondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000))
    }
  }

  // Peringkat selalu dihitung (murah — jumlah pemain kecil), tapi daftar
  // lengkapnya hanya diungkap pada fase reveal/finished supaya pemain tidak
  // bisa memantau posisi lawan selama soal berjalan.
  //
  // buildLeaderboard() dari scoring.js dipakai APA ADANYA supaya urutan &
  // aturan peringkat mode live tidak berubah sama sekali.
  //
  // `correct` pada tiap baris HANYA diisi pada fase reveal (bukan finished):
  // pada fase reveal, kunci jawaban soal aktif sudah publik, jadi menandai
  // siapa yang benar/salah tidak membocorkan apa pun. Pada fase finished,
  // soal aktif sudah bukan soal terakhir yang baru dibahas, jadi penandanya
  // dibiarkan null agar tidak menyesatkan.
  const fullRanking = buildLeaderboard(
    Array.from(room.players.values(), (p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      joinedAt: p.joinedAt,
    }))
  )
  // `leaderboard` memuat NAMA + SKOR semua pemain. HANYA untuk penonton
  // beridentitas (host/pemain) — anonim yang tahu kode 6 huruf tidak boleh
  // mengunduh daftar nama & skor seluruh kelas, baik saat reveal maupun selesai.
  const leaderboard =
    viewer && isReveal
      ? fullRanking.map((row) => ({
          ...row,
          correct:
            room.phase === "reveal"
              ? room.answers.get(`${questionIndex}:${row.playerId}`)?.correct ?? null
              : null,
        }))
      : null

  const answeredCount =
    questionIndex >= 0 && room.mode !== "exam" ? answeredCountFor(room, questionIndex) : 0
  const answeredPlayerIds =
    questionIndex >= 0 ? answeredIdsFor(room, questionIndex) : []

  // Jawaban pemain penonton untuk soal aktif — miliknya sendiri, jadi aman
  // dikirim (dan memang dibutuhkan: setelah refresh, tombol opsi yang sudah
  // dipilih harus tetap tertandai).
  const viewerAnswer =
    viewerPlayer && questionIndex >= 0 && !examDone
      ? room.answers.get(`${questionIndex}:${viewerPlayer.id}`) || null
      : null

  let you = null
  if (viewerPlayer) {
    const rank = fullRanking.find((row) => row.playerId === viewerPlayer.id)?.rank ?? null
    you = {
      playerId: viewerPlayer.id,
      name: viewerPlayer.name,
      score: visibleScoreFor(room, viewerPlayer),
      rank: visibleRankFor(room, viewerPlayer, rank),
      answeredCurrent: answeredPlayerIds.includes(viewerPlayer.id),
      answerIndex: viewerAnswer ? viewerAnswer.optionIndex : null,
      // Streak milik viewer sendiri — aman dikirim kapan pun (tidak membocorkan
      // kunci jawaban pemain lain).
      streak: streakFor(room, viewerPlayer.id, questionIndex >= 0 ? questionIndex : 0),
      // Tambahan mode exam: posisi & status pemain ini.
      index: room.mode === "exam" ? Math.min(viewerPlayer.index, room.questions.length) : null,
      finished: viewerPlayer.finishedAt !== null,
      // Mode exam + umpan balik mati: `answeredCurrent` di atas akan selalu
      // false (pemain langsung pindah soal setelah menjawab), jadi posisi soal
      // dan riwayat "sudah dijawab" tidak berguna di sana. Field `index` di
      // atas tetap memberi tahu klien di soal mana dia berada.
    }
  }

  return {
    code: room.code,
    title: room.title,
    phase: room.phase,
    version: room.version,
    currentIndex: room.mode === "exam" ? questionIndex : room.currentIndex,
    totalQuestions: room.questions.length,
    secondsLeft,

    // ── Mode & pengaturan (tidak ada rahasia di dalamnya) ──
    mode: room.mode,
    settings: { ...settings },
    locked: room.locked,
    rolledTimes: room.rolledTimes ? [...room.rolledTimes] : null,

    // Soal aktif — teks & opsi saja. TIDAK ADA correctIndex di sini.
    question:
      hasQuestion && !examDone
        ? {
            index: questionIndex,
            text: question.text,
            options: [...question.options],
            timeSec: question.timeSec,
            image: question.image ?? null,
            optionImages: [...(question.optionImages ?? [null, null, null, null])],
            totalQuestions: room.questions.length,
          }
        : null,

    // Kunci jawaban hanya dibuka setelah soal ditutup.
    reveal:
      isReveal && question && !examDone
        ? {
            correctIndex: question.correctIndex,
            distribution: distributionFor(room, questionIndex),
            yourAnswer: viewerAnswer ? viewerAnswer.optionIndex : null,
            // Penjelasan jawaban ikut di sini — pada fase reveal kunci sudah
            // publik, jadi menampilkannya tidak membocorkan apa pun. Tanpa ini
            // field `explanation` yang dikumpulkan editor tidak pernah terlihat
            // di mode live.
            explanation: question.explanation ?? null,
            // Poin yang DIDAPAT pemain penonton pada soal ini — miliknya sendiri,
            // jadi tidak ada risiko kebocoran. Berguna supaya umpan balik "+1.842"
            // tetap benar setelah halaman di-refresh.
            yourPoints: viewerAnswer ? viewerAnswer.points : null,
            // Persentase pemain yang menjawab BENAR dan persentase yang sudah
            // menjawab — hanya fase reveal (kunci sudah publik), jadi aman.
            correctPercent:
              answeredCount > 0
                ? Math.round(
                    (distributionFor(room, questionIndex)[question.correctIndex] / answeredCount) * 100
                  )
                : 0,
            answeredPercent:
              room.players.size > 0
                ? Math.round((answeredCount / room.players.size) * 100)
                : 0,
            // Pemain tercepat yang menjawab benar (untuk badge "⚡ Pemain tercepat").
            fastest: fastestCorrectFor(room, questionIndex),
          }
        : null,

    // Report HANYA untuk host pada fase finished — pemain tidak pernah
    // menerima ini (memuat teks soal lengkap + statistik agregat).
    report:
      viewer?.kind === "host" && room.phase === "finished" ? roomReportFor(room) : null,

    // Daftar nama pemain hanya perlu di lobby; setelah mulai, identitas pemain
    // yang tampil ke publik cukup lewat leaderboard. Tetap digerbangi `viewer`
    // supaya anonim tidak mengunduh daftar nama seluruh kelas.
    players:
      room.phase === "lobby" && viewer
        ? Array.from(room.players.values(), (p) => ({ id: p.id, name: p.name }))
        : null,

    // `roster` = id + nama semua pemain. HANYA untuk penonton beridentitas
    // (host/pemain). Penonton anonim yang tahu kode 6 huruf tidak boleh
    // mengunduh daftar nama seluruh kelas — cukup lihat kuis berjalan.
    roster: viewer
      ? Array.from(room.players.values(), (p) => ({ id: p.id, name: p.name }))
      : null,

    playerCount: room.players.size,
    answeredCount,
    answeredPlayerIds: viewer ? answeredPlayerIds : [],
    leaderboard,
    you,

    // ── Tambahan v2 ──
    // Progres MILIK PENONTON sendiri (bukan agregat room).
    progress: progressFor(room, viewerPlayer),
    totalSecondsLeft,
    // Layar host mode exam: siapa sudah sampai soal berapa. HANYA host —
    // ini membuka posisi tiap pemain, jadi tidak diberikan ke anonim.
    playerStates:
      room.mode === "exam" && viewer?.kind === "host"
        ? Array.from(room.players.values(), (player) => ({
            id: player.id,
            name: player.name,
            index: Math.min(player.index, room.questions.length),
            answered: answeredByPlayer(room, player.id),
            total: room.questions.length,
            finished: player.finishedAt !== null,
          }))
        : null,
    // Hasil akhir HANYA pada fase finished — memuat correctIndex per soal
    // (sudah publik pada fase itu) dan myResult khusus untuk pemain penonton.
    // Penonton anonim TIDAK menerima results: kode room dibagikan lewat
    // proyektor, jadi membiarkan siapa pun mengunduh kunci + skor seluruh
    // peserta setelah selesai adalah kebocoran yang tidak perlu.
    results: room.phase === "finished" && viewer ? buildResults(room, viewerPlayer) : null,
  }
}
