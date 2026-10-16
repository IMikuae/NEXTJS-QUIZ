"use client"

import { useState } from "react"
import { MathText } from "@/components/MathText"
import { Modal } from "@/components/Modal"
import { PlayerChips } from "@/components/PlayerChips"
import { Timer } from "@/components/Timer"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { OPTION_LETTERS } from "@/lib/quiz-ui"

// ═══════════════════════════════════════════════════════════════════════════
// HOST LIVE — layout proyektor: grid 2 kolom di ≥1024px (soal+timer+opsi di
// kiri, statistik live di kanan).
//
// Kontrol yang disediakan DI SINI hanya yang khusus fase soal:
//   +10 Detik (maks 6× per soal, dijaga server) · Lewati Soal (konfirmasi)
//   Soal Berikutnya (aktif hanya bila waktu habis / sudah reveal)
//   Paksa Lanjut  (mode live: setara "next" tapi selalu diizinkan server)
// Tombol end/lock/restart/kick tinggal di kartu "Kontrol host" (HostClient).
//
// Semua aksi tetap tervalidasi server — ini hanya UX, bukan pengamanan.
// ═══════════════════════════════════════════════════════════════════════════

export function HostLive({
  state,
  question,
  players,
  answeredIds,
  busy,
  busyAction,
  canAdvance,
  projector,
  onExtend,
  onSkip,
  onNext,
  onAdvance,
}) {
  const [skipOpen, setSkipOpen] = useState(false)
  const [zoom, setZoom] = useState(false)
  const answeredRatio = state.playerCount > 0 ? state.answeredCount / state.playerCount : 0
  const totalSecondsLeft = state.totalSecondsLeft ?? null
  const totalTimeLimit = state.settings?.totalTimeSec ?? 0

  return (
    <>
      <div className="host-grid">
        {/* ── Kolom kiri: soal + timer + opsi ── */}
        <div className="card glass-card">
          <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <span className="question-number">
              Soal {question.index + 1} / {state.totalQuestions}
            </span>
            <span className="question-number">
              {state.answeredCount} / {state.playerCount} sudah menjawab
            </span>
          </div>

          {totalSecondsLeft !== null && totalSecondsLeft !== undefined ? (
            <div className="total-time">
              <div className="total-time-head">
                <span>Sisa waktu seluruh kuis</span>
                <strong>
                  {Math.floor(totalSecondsLeft / 60)}:
                  {String(totalSecondsLeft % 60).padStart(2, "0")}
                </strong>
              </div>
              <div
                className="total-time-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={totalTimeLimit}
                aria-valuenow={totalSecondsLeft}
              >
                <div
                  className="total-time-fill"
                  style={{
                    width: `${
                      totalTimeLimit > 0
                        ? Math.max(0, Math.min(1, totalSecondsLeft / totalTimeLimit)) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
            <Timer
              secondsLeft={state.secondsLeft}
              totalSec={question.timeSec}
              resetKey={question.index}
              variant="ring"
              size={projector ? 150 : 110}
            />

            <div style={{ flex: 1, minWidth: 240 }}>
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
              <h1
                className="card-title projector-q question-text"
                style={{ fontSize: projector ? undefined : 24, lineHeight: 1.35 }}
              >
                <MathText text={question.text} />
              </h1>
            </div>
          </div>

          <div className="options" style={{ marginTop: 18 }}>
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
            <div className="stat" style={{ flex: 1, minWidth: 180 }}>
              <span className="stat-value">{state.answeredCount}/{state.playerCount}</span>
              <div className="progressbar" style={{ marginTop: 8 }}>
                <div className="progressbar-fill" style={{ width: `${Math.round(answeredRatio * 100)}%` }} />
              </div>
            </div>

            <div className="btn-row">
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={onExtend}
                title="Tambahkan 10 detik ke soal ini (maks 6× per soal)"
              >
                {busyAction === "extend" && <span className="spinner" aria-hidden />}
                +10 Detik
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => setSkipOpen(true)}
                title="Tutup soal ini sekarang dan tampilkan jawabannya"
              >
                {busyAction === "skip" && <span className="spinner" aria-hidden />}
                Lewati Soal
              </button>
              {onAdvance && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={onAdvance}
                  title="Paksa lanjut ke soal berikutnya walau waktu masih berjalan"
                >
                  {busyAction === "advance" && <span className="spinner" aria-hidden />}
                  Paksa Lanjut
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canAdvance || busy}
                onClick={onNext}
                title={canAdvance ? undefined : "Tunggu sampai waktu soal habis"}
              >
                {busyAction === "next" && <span className="spinner" aria-hidden />}
                Soal Berikutnya
              </button>
            </div>
          </div>

          {state.settings?.instantFeedback ? (
            <p className="footer-note">
              Umpan balik langsung menyala: pemain sudah melihat benar/salah, tapi fase
              tetap &ldquo;soal berjalan&rdquo; sampai kamu menekan Soal Berikutnya.
            </p>
          ) : null}
        </div>

        {/* ── Kolom kanan: statistik live ── */}
        <div className="card glass-card">
          <h2 className="card-title">Pemain</h2>
          <p className="card-hint">
            ✓ = sudah menjawab soal ini. Nama berwarna unik per pemain.
          </p>

          {players.length === 0 ? (
            <p className="card-hint">Tidak ada pemain.</p>
          ) : (
            <PlayerChips players={players} answeredIds={answeredIds} />
          )}

          {!canAdvance && !projector && (
            <p className="footer-note">
              Fase pembahasan muncul otomatis saat waktu habis. Gunakan “Lewati Soal”
              untuk menutup lebih awal.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={skipOpen}
        title="Lewati soal ini?"
        message={`Soal ${question.index + 1} akan langsung ditampilkan jawabannya. Pemain yang belum menjawab dianggap "Tidak menjawab".`}
        confirmLabel="Lewati sekarang"
        onConfirm={() => {
          setSkipOpen(false)
          onSkip()
        }}
        onCancel={() => setSkipOpen(false)}
      />

      {zoom && question.image ? (
        <Modal open onClose={() => setZoom(false)} title="Gambar soal" maxWidth={880}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="img-zoom-img" src={question.image} alt="Gambar soal diperbesar" />
        </Modal>
      ) : null}
    </>
  )
}
