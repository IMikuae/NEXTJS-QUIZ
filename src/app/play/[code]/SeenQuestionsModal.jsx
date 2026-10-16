"use client"

import { MathText } from "@/components/MathText"
import { Modal } from "@/components/Modal"
import { OPTION_LETTERS } from "@/lib/quiz-ui"

// ═══════════════════════════════════════════════════════════════════════════
// SEEN QUESTIONS MODAL — hanya menampilkan soal yang sudah lewat
// ═══════════════════════════════════════════════════════════════════════════
// Data dari memori (seenRef di PlayClient). Tidak memuat benar/salah, tidak
// menulis storage. Jawaban tidak bisa diubah dari sini karena kontrak room
// tidak punya endpoint untuk memindahkan index pemain mundur — lihat
// CONTRACT-DEVIATIONS.md.
// ═══════════════════════════════════════════════════════════════════════════

export function SeenQuestionsModal({ rows, currentIndex, onClose }) {
  const previous = rows.filter((row) => row.index < currentIndex).slice().reverse()

  return (
    <Modal open onClose={onClose} title="Soal yang sudah kamu lewati" maxWidth={640}>
      <p className="card-hint">
        Daftar ini hanya untuk menengok kembali — jawaban yang sudah terkirim tidak
        bisa diubah.
      </p>

      {previous.length === 0 ? (
        <p className="card-hint">Belum ada soal sebelumnya.</p>
      ) : (
        previous.map((row) => (
          <div className="question-block" key={row.index}>
            <div className="question-head">
              <span className="question-number">Soal {row.index + 1}</span>
            </div>
            <div className="preview-text">
              <MathText text={row.text} />
            </div>
            <ul className="exam-result-answers">
              {row.options.map((option, index) => (
                <li key={index}>
                  <span className="mono">{OPTION_LETTERS[index]}.</span>{" "}
                  <MathText text={option} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Kembali ke soal berjalan
        </button>
      </div>
    </Modal>
  )
}
