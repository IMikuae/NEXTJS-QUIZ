"use client"

import { useState } from "react"
import Link from "next/link"
import { MathText } from "@/components/MathText"
import { OPTION_LETTERS } from "@/lib/quiz-ui"

// ═══════════════════════════════════════════════════════════════════════════
// EXAM RESULTS — layar akhir mode ujian (nilai, lulus/tidak, pembahasan)
// ═══════════════════════════════════════════════════════════════════════════
// Diekstrak dari PlayClient.jsx. Data jawaban pribadi ("jawabanmu") datang dari
// peta di MEMORI (myAnswers), bukan storage — lihat CONTRACT §8. Bila peta
// kosong (halaman dimuat ulang), ditampilkan catatan jujur, bukan tebakan.
// ═══════════════════════════════════════════════════════════════════════════

export function ExamResults({ results, you, seen, myAnswers }) {
  const [plain, setPlain] = useState(false)

  if (!results) {
    return (
      <div className="card">
        <h1 className="card-title center">Ujian selesai</h1>
        <p className="card-hint center">
          Skormu: <strong>{(you?.score ?? 0).toLocaleString("id-ID")}</strong>. Rincian
          hasil belum tersedia dari server.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/" className="btn btn-primary">Kembali ke Beranda</Link>
        </div>
      </div>
    )
  }

  const mine = results.myResult
  const perQuestion = Array.isArray(results.perQuestion) ? results.perQuestion : []
  const passing = results.passingScore ?? 70
  const seenMap = new Map((seen ?? []).map((row) => [row.index, row]))
  const answerMap = myAnswers instanceof Map ? myAnswers : new Map()

  const grade = mine?.grade ?? 0
  const passed = mine?.passed ?? grade >= passing
  const secondsUsed = mine?.secondsUsed ?? null
  const mentioned = mine?.total ?? perQuestion.length
  const answeredCount = (mine?.correct ?? 0) + (mine?.wrong ?? 0)
  // Peta pilihan kosong PADAHAL server bilang ada jawaban → halaman dimuat ulang
  // setelah ujian selesai. Itu satu-satunya kasus yang perlu dijelaskan ke pemain.
  const choicesLost = answerMap.size === 0 && answeredCount > 0

  return (
    <>
      <div className={`card exam-result-card${passed ? " is-passed" : " is-failed"}`}>
        <h1 className="card-title center">
          {passed ? "🎉 Lulus!" : "Belum lulus"}
        </h1>

        <div className="exam-result-scope">
          <div className="exam-result-grade">
            <span className="exam-result-grade-value">{grade}</span>
            <span className="exam-result-grade-label">dari 100</span>
          </div>
          <div className="exam-result-meta">
            <p>
              Nilai minimum lulus: <strong>{passing}</strong>
            </p>
            <p>
              Benar <strong>{mine?.correct ?? 0}</strong> · Salah{" "}
              <strong>{mine?.wrong ?? 0}</strong> · Tidak dijawab{" "}
              <strong>{mine?.unanswered ?? 0}</strong>
            </p>
            <p>
              {mine?.total ?? perQuestion.length} soal
              {secondsUsed !== null
                ? ` · waktu terpakai ${Math.floor(secondsUsed / 60)} menit ${secondsUsed % 60} detik`
                : ""}
            </p>
            {results.averageGrade !== undefined && (
              <p>
                Rata-rata kelas: <strong>{results.averageGrade}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="exam-result-stats">
          <div className="stat-card">
            <span className="stat-value">{mine?.rank ? `#${mine.rank}` : "—"}</span>
            <span className="stat-label">Peringkat</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{mine?.correct ?? 0}</span>
            <span className="stat-label">Benar</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{mine?.wrong ?? 0}</span>
            <span className="stat-label">Salah</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{mine?.unanswered ?? 0}</span>
            <span className="stat-label">Tidak dijawab</span>
          </div>
        </div>

        <div className="btn-row" style={{ justifyContent: "center", marginTop: 20 }}>
          <Link href="/" className="btn btn-primary">Main Lagi</Link>
          <Link href="/my-quizzes" className="btn">Kuis Saya</Link>
        </div>
      </div>

      <div className="card">
        <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Pembahasan per soal</h2>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-pressed={plain}
            onClick={() => setPlain((prev) => !prev)}
          >
            {plain ? "Lihat sebagai matematika" : "Lihat sebagai teks biasa"}
          </button>
        </div>

        <p className="card-hint">
          Kamu menjawab {answeredCount} dari {mentioned} soal. Jawaban benar ditandai hijau.
        </p>

        {choicesLost && (
          <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>
            <strong>Catatan:</strong> kolom “jawabanmu” tidak bisa ditampilkan karena
            halaman ini dimuat ulang setelah ujian selesai (pilihanmu hanya dipegang
            selama ujian berjalan, tidak pernah disimpan di perangkat — itu disengaja).
            Angka benar/salah di atas tetap berasal dari server.
          </div>
        )}

        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {perQuestion.map((row) => {
            const seenRow = seenMap.get(row.index)
            const text = row.text ?? seenRow?.text ?? ""
            const options = seenRow?.options ?? []
            const stored = answerMap.get(row.index)
            const yourAnswer = Number.isInteger(stored) && stored >= 0 ? stored : null
            const hasKey = Number.isInteger(row.correctIndex)
            const isCorrect = hasKey && yourAnswer !== null && yourAnswer === row.correctIndex
            const unanswered = hasKey && yourAnswer === null

            return (
              <div
                className={`exam-result-row${isCorrect ? " is-correct" : ""}${unanswered ? " is-unanswered" : ""}`}
                key={row.index}
              >
                <div className="exam-result-row-head">
                  <span className="question-number">Soal {row.index + 1}</span>
                  <span className={`exam-result-tag${isCorrect ? " is-correct" : unanswered ? "" : " is-wrong"}`}>
                    {isCorrect ? "✓ Benar" : unanswered ? "— Tidak dijawab" : "✗ Salah"}
                  </span>
                  <span className="pct-big" style={{ fontSize: 12.5 }}>
                    {row.correctCount}/{row.answeredCount} pemain benar
                  </span>
                </div>
                {text ? (
                  <div className="preview-text">
                    {plain ? <span className="mono">{text}</span> : <MathText text={text} />}
                  </div>
                ) : null}

                <ul className="exam-result-answers">
                  <li>
                    <span className="label-inline">Jawabanmu:</span>{" "}
                    {yourAnswer === null ? (
                      <em>tidak tersedia</em>
                    ) : plain ? (
                      <span className="mono">{options[yourAnswer] ?? "(teks tidak tersedia)"}</span>
                    ) : options[yourAnswer] ? (
                      <MathText text={options[yourAnswer]} />
                    ) : (
                      <em>pilihan {OPTION_LETTERS[yourAnswer] ?? "?"}</em>
                    )}
                  </li>
                  <li>
                    <span className="label-inline">Jawaban benar:</span>{" "}
                    {hasKey ? (
                      plain ? (
                        <span className="mono">
                          {options[row.correctIndex] ?? `pilihan ${OPTION_LETTERS[row.correctIndex]}`}
                        </span>
                      ) : options[row.correctIndex] ? (
                        <MathText text={options[row.correctIndex]} />
                      ) : (
                        <span className="mono">{OPTION_LETTERS[row.correctIndex]}</span>
                      )
                    ) : (
                      <em>tidak tersedia</em>
                    )}
                  </li>
                  {row.explanation ? (
                    <li>
                      <span className="label-inline">Penjelasan:</span>{" "}
                      {plain ? <span className="mono">{row.explanation}</span> : <MathText text={row.explanation} />}
                    </li>
                  ) : null}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
