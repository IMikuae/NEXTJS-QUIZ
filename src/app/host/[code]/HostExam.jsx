"use client"

import { MathText } from "@/components/MathText"
import { Timer } from "@/components/Timer"
import { OPTION_LETTERS } from "@/lib/quiz-ui"

// ═══════════════════════════════════════════════════════════════════════════
// HOST EXAM — layar host saat mode ujian berjalan (CONTRACT §6)
// ═══════════════════════════════════════════════════════════════════════════
// Di mode ujian, setiap pemain punya index & deadline SENDIRI, jadi:
//   • tidak ada fase reveal — soal berikutnya dijalankan server per pemain
//   • TIDAK ada tombol "Soal Berikutnya" (server membalas 409)
//   • yang ditampilkan: soal aktif (indeks bersama untuk tampilan), papan
//     progres `state.playerStates`, dan ringkasan siapa sudah selesai
//
// `playerStates[i]` = { id, name, index, answered, total, finished }.
// Semua angka datang dari server — host hanya menampilkan.
// ═══════════════════════════════════════════════════════════════════════════

export function HostExam({ state, question, playerStates, projector, settingsText }) {
  const rows = Array.isArray(playerStates) ? playerStates : []
  const finishedCount = rows.filter((row) => row.finished).length
  const activeCount = rows.length - finishedCount

  // Distribusi kemajuan: berapa pemain yang sudah menjawab soal mereka masing-masing.
  const totalAnswered = rows.reduce((sum, row) => sum + (Number(row.answered) || 0), 0)
  const totalQuestions = rows.reduce((sum, row) => sum + (Number(row.total) || 0), 0)
  const overallRatio = totalQuestions > 0 ? totalAnswered / totalQuestions : 0

  return (
    <div className={projector ? "host-grid" : ""}>
      {/* ── Kolom kiri: soal yang sedang ditampilkan + opsinya ── */}
      <div className="card glass-card">
        <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <span className="question-number">
            Soal {question.index + 1} / {state.totalQuestions}
          </span>
          <span className="tpl-badge is-warn">Mode ujian · tanpa pembahasan</span>
        </div>

        <p className="footer-note" style={{ textAlign: "left", marginTop: 4 }}>
          {settingsText}. Setiap pemain berjalan dengan kecepatannya sendiri —
          angka di bawah berasal dari server dan diperbarui tiap detik.
        </p>

        {state.secondsLeft !== null && state.secondsLeft !== undefined ? (
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 8 }}>
            <Timer
              secondsLeft={state.secondsLeft}
              totalSec={question.timeSec}
              resetKey={question.index}
              variant="ring"
              size={projector ? 130 : 96}
            />
            <p className="card-hint" style={{ flex: 1, minWidth: 200, margin: 0 }}>
              Ring ini hanya perkiraan durasi soal untuk pemain yang BARU memulai
              soal ini. Batas waktu setiap pemain dihitung server secara terpisah.
            </p>
          </div>
        ) : null}

        <div className="question-text" style={{ marginTop: 14 }}>
          <MathText text={question.text} as="h1" className="card-title projector-q" />
        </div>

        {question.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="question-image" src={question.image} alt="Gambar soal" />
        ) : null}

        <div className="options" style={{ marginTop: 16 }}>
          {question.options.map((option, index) => (
            <div className="option-card projector-opt" key={index}>
              <span className="option-badge">{OPTION_LETTERS[index]}</span>
              {question.optionImages?.[index] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="option-thumb"
                  src={question.optionImages[index]}
                  alt={`Gambar opsi ${OPTION_LETTERS[index]}`}
                />
              ) : null}
              <span className="option-label">
                <MathText text={option} />
              </span>
            </div>
          ))}
        </div>

        <div className="counter-row">
          <div className="stat" style={{ flex: 1, minWidth: 200 }}>
            <span className="stat-value">{Math.round(overallRatio * 100)}%</span>
            <span className="stat-label">Kemajuan kelas keseluruhan</span>
            <div className="progressbar" style={{ marginTop: 8 }}>
              <div className="progressbar-fill" style={{ width: `${Math.round(overallRatio * 100)}%` }} />
            </div>
          </div>
          <p className="footer-note" style={{ textAlign: "right", margin: 0 }}>
            Belum selesai <strong>{activeCount}</strong> · sudah selesai{" "}
            <strong>{finishedCount}</strong>
          </p>
        </div>
      </div>

      {/* ── Kolom kanan: progres per pemain ── */}
      <div className="card glass-card">
        <h2 className="card-title">Progres pemain</h2>
        <p className="card-hint">
          Kolom “Soal” menunjukkan posisi tiap pemain (indeksnya sendiri). Pemain
          yang waktunya habis otomatis dicatat “tidak menjawab” oleh server.
        </p>

        {rows.length === 0 ? (
          <p className="card-hint">Belum ada data pemain dari server.</p>
        ) : (
          <div className="exam-table-wrap">
            <table className="exam-table">
              <thead>
                <tr>
                  <th scope="col">Nama</th>
                  <th scope="col">Soal</th>
                  <th scope="col">Dijawab</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ratio = row.total > 0 ? Math.min(1, (row.answered / row.total) * 1) : 0
                  return (
                    <tr key={row.id} className={row.finished ? "is-passed" : ""}>
                      <td>{row.name}</td>
                      <td>
                        {row.finished ? "selesai" : `${Math.min(row.index + 1, row.total)} / ${row.total}`}
                      </td>
                      <td>
                        {row.answered} / {row.total}
                        <div className="progressbar" style={{ marginTop: 6, minWidth: 90 }}>
                          <div className="progressbar-fill" style={{ width: `${Math.round(ratio * 100)}%` }} />
                        </div>
                      </td>
                      <td>
                        {row.finished ? (
                          <span className="tpl-badge is-success">Selesai</span>
                        ) : row.answered === 0 ? (
                          <span className="tpl-badge is-warn">Baru mulai</span>
                        ) : (
                          <span className="tpl-badge">Mengerjakan</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="footer-note">
          Sesi berakhir otomatis saat SEMUA pemain selesai, atau lebih cepat dengan
          tombol “Akhiri Sesi” di Kontrol host.
        </p>
      </div>
    </div>
  )
}
