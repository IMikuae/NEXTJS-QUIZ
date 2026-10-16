"use client"

import { useState } from "react"
import Link from "next/link"
import { MathText } from "@/components/MathText"
import { Modal } from "@/components/Modal"
import { OPTION_LETTERS } from "@/lib/quiz-ui"

// ═══════════════════════════════════════════════════════════════════════════
// PLAY DISPLAY — komponen presentasional layar pemain
// ═══════════════════════════════════════════════════════════════════════════
// Diekstrak dari PlayClient.jsx supaya komponen utama hanya mengurus state &
// alur. Semua komponen di sini MURNI presentasi (props masuk, JSX keluar).
// ═══════════════════════════════════════════════════════════════════════════

/** Kartu untuk pemain yang identitasnya hilang atau tidak valid. */
export function DeadEndCard({ code, title, message }) {
  return (
    <div className="card center" style={{ marginTop: 48 }}>
      <p style={{ fontSize: 40, margin: 0 }} aria-hidden>🚫</p>
      <h1 className="card-title" style={{ marginTop: 14 }}>{title}</h1>
      <p className="card-hint" style={{ marginBottom: 22 }}>{message}</p>
      <div className="btn-row" style={{ justifyContent: "center" }}>
        <Link href="/" className="btn btn-primary">Ke halaman utama</Link>
        <Link href={`/play/${code}`} className="btn">Coba masuk ulang</Link>
      </div>
    </div>
  )
}

/** Bar tipis sisa waktu TOTAL (timeMode "total") — bukan ring kedua. */
export function TotalTimeBar({ secondsLeft, totalSec }) {
  if (secondsLeft === null || secondsLeft === undefined) return null
  const ratio = totalSec > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSec)) : 0
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60
  const critical = secondsLeft <= 60

  return (
    <div className={`total-time${critical ? " is-critical" : ""}`}>
      <div className="total-time-head">
        <span>Sisa waktu kuis</span>
        <strong>
          {minutes}:{String(seconds).padStart(2, "0")}
        </strong>
      </div>
      <div
        className="total-time-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSec}
        aria-valuenow={secondsLeft}
        aria-label="Sisa waktu seluruh kuis"
      >
        <div className="total-time-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** Indikator "Soal 3 dari 20" + bar progres. */
export function QuestionProgress({ index, total, answered }) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, (index + 1) / total)) : 0
  return (
    <div className="exam-progress">
      <div className="exam-progress-head">
        <span>Soal {index + 1} dari {total}</span>
        {answered !== null && answered !== undefined ? (
          <span>Terjawab {answered}</span>
        ) : null}
      </div>
      <div
        className="exam-progress-track"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, total)}
        aria-valuenow={index + 1}
        aria-label={`Soal ${index + 1} dari ${total}`}
      >
        <div className="exam-progress-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

/** Kartu berisi soal (gambar opsional + teks matematika + opsi bergambar). */
export function QuestionCard({ question, children, header }) {
  const [zoom, setZoom] = useState(false)

  return (
    <div className="card glass-card">
      {header}

      {question.image ? (
        <button
          type="button"
          className="question-image-btn"
          onClick={() => setZoom(true)}
          aria-label="Perbesar gambar soal"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="question-image" src={question.image} alt="Gambar soal" />
        </button>
      ) : null}

      <div className="question-text">
        <MathText text={question.text} as="h1" className="card-title" />
      </div>

      {children}

      {zoom && question.image ? (
        <Modal open onClose={() => setZoom(false)} title="Gambar soal" maxWidth={880}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-zoom-img" src={question.image} alt="Gambar soal diperbesar" />
        </Modal>
      ) : null}
    </div>
  )
}

/** Satu tombol opsi: huruf, gambar opsi (bila ada), lalu teks matematika. */
export function OptionButton({ index, option, image, disabled, onClick, className = "" }) {
  return (
    <button
      type="button"
      className={`option-button${className ? ` ${className}` : ""}`}
      disabled={disabled}
      onClick={onClick ?? undefined}
    >
      <span className="option-badge">{OPTION_LETTERS[index]}</span>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="option-thumb" src={image} alt={`Gambar opsi ${OPTION_LETTERS[index]}`} />
      ) : null}
      <span className="option-label">
        {option ? <MathText text={option} /> : "(kosong)"}
      </span>
    </button>
  )
}
