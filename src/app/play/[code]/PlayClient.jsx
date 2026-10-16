"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ConnectionPill } from "@/components/ConnectionPill"
import { Leaderboard } from "@/components/Leaderboard"
import { MathText } from "@/components/MathText"
import { PlayerChips } from "@/components/PlayerChips"
import { Podium } from "@/components/Podium"
import { Timer } from "@/components/Timer"
import { CodeInput } from "@/components/CodeInput"
import { forgetPlayer, loadPlayer, postJson, useRoomState } from "@/lib/room-client"
import { describeSettings } from "@/components/QuizSettingsPanel"
import { OPTION_LETTERS } from "@/lib/quiz-ui"
import { DeadEndCard, OptionButton, QuestionCard, QuestionProgress, TotalTimeBar } from "./PlayDisplay"
import { ExamResults } from "./ExamResults"
import { SeenQuestionsModal } from "./SeenQuestionsModal"

// ═══════════════════════════════════════════════════════════════════════════
// PLAY CLIENT — pengalaman pemain (mobile-first), dua mode (CONTRACT §1 & §6)
//
//   mode "live" — perilaku lama, tidak diubah:
//     lobby → question → reveal → finished
//       + instantFeedback: benar/salah muncul setelah menjawab (fase tetap
//         question sampai host lanjut)
//       + explanation dirender di fase reveal bila ada
//
//   mode "exam" — self-paced per pemain:
//     lobby → question (berulang) → finished
//       • TIDAK ADA fase reveal di tengah. Setelah menjawab / waktu habis,
//         langsung soal berikutnya (server yang memindahkan index).
//       • instantFeedback → kilat benar/salah ≤1,2 detik, lalu lanjut
//       • instantFeedback mati → TIDAK ada benar/salah sama sekali, hanya
//         animasi "terkirim" lalu lanjut
//       • Layar akhir: nilai 0–100, lulus/tidak, waktu terpakai, pembahasan
//
// ██ ANTI-INSPECT (CONTRACT §8) ████████████████████████████████████████████
//   Satu-satunya kunci penyimpanan di jalur ini adalah `quiz:player:{code}`
//   di sessionStorage, berisi { playerId, token, name } — ditulis oleh
//   savePlayer(). TIDAK ADA indeks jawaban benar, status benar/salah, atau
//   progres per soal yang ditulis ke localStorage/sessionStorage. Riwayat soal
//   yang sudah lewat (untuk tombol "lihat soal sebelumnya" di mode ujian) hidup
//   HANYA di memori React dan hilang saat halaman ditutup.
//   Menu konteks & tombol kembali browser hanya ISYARAT UI, bukan pengaman —
//   lihat README.
// ███████████████████████████████████████████████████████████████████████████
// ═══════════════════════════════════════════════════════════════════════════

/** Lama kilat benar/salah di mode ujian (CONTRACT §6: ≤1,2 detik). */
const EXAM_FLASH_MS = 1150
/** Lama animasi "terkirim" saat instantFeedback mati. */
const EXAM_SENT_MS = 620

export default function PlayClient({ code }) {
  const [identity, setIdentity] = useState(null)
  const [identityChecked, setIdentityChecked] = useState(false)
  const [chosenIndex, setChosenIndex] = useState(null)
  const [sendError, setSendError] = useState("")
  const [sending, setSending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  // Kilat hasil di mode ujian (memori saja — tidak pernah ditulis ke storage).
  const [examFlash, setExamFlash] = useState(null) // { kind, correct?, explanation? }
  const flashTimer = useRef(null)

  // Riwayat soal yang SUDAH dilewati (untuk tombol "lihat soal sebelumnya").
  // Hanya berisi teks/opsi/gambar yang memang sudah tampil ke pemain — tidak
  // pernah benar/salah. Hidup di memori React (state, bukan storage), hilang
  // saat halaman ditutup. State (bukan ref) supaya boleh dibaca saat render.
  const [seen, setSeen] = useState([])

  // Pilihan yang DIKIRIM pemain ini, per indeks soal (mode ujian). Ini data
  // milik pemain sendiri yang memang dia ketahui (dia yang memilih), disimpan
  // HANYA di memori React — bukan localStorage/sessionStorage (CONTRACT §8).
  // Dipakai supaya layar pembahasan bisa menulis "jawabanmu" tanpa menebak:
  // server tidak mengirim jawaban pribadi di `results.perQuestion`.
  const [myAnswers, setMyAnswers] = useState(() => new Map())

  // Identitas dibaca dari sessionStorage saat halaman dibuka (satu-satunya
  // kunci storage di jalur ini — CONTRACT §8). Pembacaan storage adalah
  // "external system", jadi setState di effect memang tujuannya.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkronisasi awal dari sessionStorage
    setIdentity(loadPlayer(code))
    setIdentityChecked(true)
  }, [code])

  const auth = useMemo(
    () => (identity ? { playerId: identity.playerId, token: identity.token } : null),
    [identity]
  )

  const { state, status, connection } = useRoomState(code, auth, {
    enabled: identityChecked && Boolean(identity),
    onForbidden: useCallback(() => {
      forgetPlayer(code)
      setIdentity(null)
    }, [code]),
  })

  const mode = state?.mode === "exam" ? "exam" : "live"
  const settings = state?.settings ?? {}
  const questionIndex = state?.question?.index ?? state?.currentIndex ?? -1

  const onAnswer = useCallback(
    async (optionIndex) => {
      if (!identity || sending) return
      if (chosenIndex !== null) return

      setSending(true)
      setSendError("")

      const result = await postJson(`/api/rooms/${code}/answer`, {
        playerId: identity.playerId,
        token: identity.token,
        questionIndex: state?.question?.index ?? state?.currentIndex ?? 0,
        optionIndex,
      })

      setSending(false)

      if (!result.ok) {
        setSendError(result.error || "Jawaban gagal terkirim. Coba lagi.")
        return
      }

      const payload = result.data ?? {}
      // Server IDEMPOTEN: kalau soal ini sudah pernah dijawab, balasannya
      // `alreadyAnswered: true` dan jawaban yang TERSIMPAN tetap yang lama.
      // Karena itu kita TIDAK boleh menimpa pilihan lokal dengan klik baru —
      // kalau ditimpa, layar menampilkan opsi yang berbeda dari yang dicatat
      // server (dan di mode exam bisa membuat "Benar!" menunjuk opsi salah).
      const already = payload.alreadyAnswered === true
      const serverIndex = state?.you?.answerIndex

      if (already) {
        // Pakai jawaban server bila kita mengetahuinya; kalau belum (state
        // belum menyusul), biarkan `lockedIndex` mengambil dari serverAnswer.
        if (typeof serverIndex === "number") setChosenIndex(serverIndex)
      } else {
        setChosenIndex(optionIndex)
      }

      // Mode ujian: langsung beri isyarat hasil (atau sekadar "terkirim"), lalu
      // biarkan polling menampilkan soal berikutnya. Server yang memindahkan
      // index — klien tidak pernah menghitung sendiri.
      //
      // Mode live: server SELALU mengirim correct/correctIndex di balasan
      // (respons privat ke pemain yang jawabannya sudah terkunci), tapi kunci
      // baru resmi dibuka di fase reveal. `instantFeedback` meminta umpan balik
      // benar/salah SEGERA — jadi hanya tampilkan bila setting itu menyala.
      if (mode === "exam") {
        const answeredIndex = state?.question?.index ?? state?.currentIndex ?? 0
        // Catat hanya jawaban yang BENAR-BENAR baru. Kalau `already`, jawaban
        // lama (yang tidak kita ketahui di sini) yang tersimpan; menulis klik
        // baru akan membuat pembahasan akhir menampilkan jawaban keliru.
        if (!already) {
          setMyAnswers((prev) => {
            const next = new Map(prev)
            next.set(answeredIndex, optionIndex)
            return next
          })
        }

        const kind = settings.instantFeedback
          ? payload.correct === true
            ? "correct"
            : "wrong"
          : "sent"

        setExamFlash({
          kind,
          // Penjelasan hanya ikut saat `instantFeedback` juga menyala. Kalau
          // hanya `showExplanation` yang hidup, penjelasan itu sendiri sudah
          // memberi tahu jawabannya benar atau salah — persis yang tidak boleh
          // terjadi di mode ujian tanpa umpan balik.
          explanation:
            settings.instantFeedback &&
            settings.showExplanation &&
            typeof payload.explanation === "string"
              ? payload.explanation
              : null,
        })

        clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(
          () => setExamFlash(null),
          settings.instantFeedback ? EXAM_FLASH_MS : EXAM_SENT_MS
        )
      } else if (settings.instantFeedback) {
        const payload = result.data ?? {}
        setExamFlash({
          kind: payload.correct === true ? "correct" : "wrong",
          explanation:
            settings.showExplanation && typeof payload.explanation === "string"
              ? payload.explanation
              : null,
        })
        clearTimeout(flashTimer.current)
        flashTimer.current = setTimeout(() => setExamFlash(null), EXAM_FLASH_MS)
      }
    },
    [identity, sending, chosenIndex, code, state, mode, settings.instantFeedback, settings.showExplanation]
  )

  // Reset pilihan lokal setiap soal berganti + catat soal ke riwayat memori.
  // State lokal HARUS mengikuti pergantian soal dari server (external system).
  //
  // PENTING: dependency HANYA `questionIndex` + `phase`, BUKAN objek
  // `state.question`. `publicState` membuat objek question baru pada setiap
  // version bump (mis. pemain lain menjawab), dan menyertakannya di sini akan
  // me-reset pilihan & kilat umpan balik di tengah soal yang sama.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset saat soal berganti (state server)
    setChosenIndex(null)
    setSendError("")
    clearTimeout(flashTimer.current)
    setExamFlash(null)
  }, [questionIndex, state?.phase, mode])

  // Catat soal yang sudah tampil ke riwayat memori (mode ujian). Dipisah dari
  // effect reset supaya pergantian objek question dari polling tidak ikut
  // me-reset pilihan. `questionIndex` + `state?.question?.text` cukup sebagai
  // penanda soal unik.
  useEffect(() => {
    const question = state?.question
    if (mode !== "exam" || !question || typeof question.index !== "number") return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- menyimpan riwayat soal yang tampil (memori)
    setSeen((prev) => {
      if (prev.some((row) => row.index === question.index)) return prev
      return [
        ...prev,
        {
          index: question.index,
          text: question.text,
          options: [...(question.options ?? [])],
          optionImages: question.optionImages ?? [null, null, null, null],
          image: question.image ?? null,
        },
      ].sort((a, b) => a.index - b.index)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cukup index & teks soal
  }, [mode, state?.question?.index, state?.question?.text])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  // ── Token ditolak / room hilang ──
  if (status === "forbidden" || status === "not_found") {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
        </div>
        <DeadEndCard
          code={code}
          title="Room tidak ditemukan atau sudah berakhir"
          message={`Room ${code} tidak ada lagi, atau identitasmu tidak dikenal server. Ini juga terjadi kalau server baru saja di-restart.`}
        />
      </main>
    )
  }

  // ── Identitas tidak ada ──
  if (identityChecked && !identity) {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
        </div>
        <DeadEndCard
          code={code}
          title="Kamu belum masuk ke room ini"
          message={`Identitas pemain untuk room ${code} tidak ada di tab ini. Buka halaman utama dan gabung dengan kode room tersebut, atau minta link join dari host.`}
        />
      </main>
    )
  }

  if (!state) {
    return (
      <main className="page page-narrow">
        <div className="waiting">
          <span className="spinner" aria-hidden /> Menghubungkan ke room {code}…
        </div>
      </main>
    )
  }

  const phase = state.phase
  const question = state.question
  const reveal = state.reveal
  const you = state.you
  const roster = state.roster || []
  const leaderboard = state.leaderboard || []
  const progress = state.progress ?? null
  const results = state.results ?? null
  const myRank = roster.findIndex((player) => player.id === you?.playerId) + 1
  const serverAnswer = you?.answerIndex ?? null
  // Jawaban SERVER menang bila sudah ada: itu sumber kebenaran. `chosenIndex`
  // hanya menutupi jeda sebelum polling membawa jawaban server. Tanpa urutan
  // ini, jawaban tampilan bisa berbeda dari yang dicatat server (mis. saat
  // klik kedua ditolak idempotensi).
  const lockedIndex = serverAnswer !== null ? serverAnswer : chosenIndex
  const totalSecondsLeft = state.totalSecondsLeft ?? null
  const totalTimeLimit = settings.totalTimeSec ?? 0

  // Mode ujian dengan umpan balik MATI: server sengaja membekukan skor di 0
  // selama ujian (lihat visibleScoreFor di quiz-store.js — skor yang bergerak
  // persis satu langkah hanya saat jawaban benar adalah alat tebak benar/salah).
  // Karena itu jangan tampilkan "Skor 0" yang membingungkan; tampilkan
  // kemajuan mengerjakan, yang memang jujur dan berguna.
  const scoreHidden = mode === "exam" && !settings.instantFeedback && !settings.showExplanation

  const header = (
    <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
      <span className="question-number">
        {mode === "exam" && progress
          ? `Soal ${progress.answered + (phase === "finished" ? 0 : 1)} dari ${progress.total}`
          : `Mode ${mode === "exam" ? "ujian" : "live"}`}
      </span>
      <span className="question-number">
        {scoreHidden
          ? `Terjawab ${progress?.answered ?? 0} dari ${progress?.total ?? state.totalQuestions}`
          : mode === "exam" && progress
            ? `Skor ${progress.score}`
            : `Skor ${(you?.score ?? 0).toLocaleString("id-ID")}`}
      </span>
    </div>
  )

  return (
    <main className="page page-narrow safe-bottom">
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <ConnectionPill connection={connection} />

      <div className="brand">
        <span className="brand-dot" aria-hidden />
        {you ? you.name : "Pemain"} · Room {code}
        {mode === "exam" ? " · Ujian" : ""}
      </div>

      {sendError && (
        <div className="alert alert-error" role="alert">
          {sendError}
        </div>
      )}

      {/* ═══ LOBBY ═══ */}
      {phase === "lobby" && (
        <div className="card glass-card">
          <h1 className="card-title">Halo, {you?.name || "pemain"}! 👋</h1>
          <p className="card-hint">
            Kamu sudah masuk ke <strong>{state.title}</strong>. Tunggu host menekan
            &ldquo;Mulai Quiz&rdquo;.
          </p>

          <div className="waiting">
            <span className="pulse-dots" aria-hidden>
              <span /><span /><span />
            </span>
            Menunggu host memulai…
          </div>

          <div className="counter-row" style={{ justifyContent: "center" }}>
            <div className="stat center">
              <span className="stat-value">{state.playerCount}</span>
              <span className="stat-label">Pemain siap</span>
            </div>
            <div className="stat center">
              <span className="stat-value">{state.totalQuestions}</span>
              <span className="stat-label">Soal</span>
            </div>
            <div className="stat center">
              <span className="stat-value">#{myRank || "—"}</span>
              <span className="stat-label">Kamu pemain ke</span>
            </div>
          </div>

          <PlayerChips players={roster} youId={you?.playerId} />

          <p className="footer-note">
            Aturan kuis: {describeSettings(settings).text}
            {state.locked ? " · lobby dikunci host" : ""}
          </p>
        </div>
      )}

      {/* ═══ SOAL (mode live) ═══ */}
      {phase === "question" && question && mode === "live" && (
        <QuestionCard
          question={question}
          header={
            <>
              {header}
              <TotalTimeBar secondsLeft={totalSecondsLeft} totalSec={totalTimeLimit} />
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <Timer
                  secondsLeft={state.secondsLeft}
                  totalSec={question.timeSec}
                  resetKey={question.index}
                  variant="ring"
                  size={92}
                />
                <QuestionProgress index={question.index} total={state.totalQuestions} />
              </div>
            </>
          }
        >
          <div className="options">
            {question.options.map((option, index) => {
              const isLocked = lockedIndex !== null
              const isChosen = lockedIndex === index
              return (
                <OptionButton
                  key={index}
                  index={index}
                  option={option}
                  image={question.optionImages?.[index] ?? null}
                  disabled={isLocked || sending}
                  className={isChosen ? "is-chosen" : ""}
                  onClick={() => onAnswer(index)}
                />
              )
            })}
          </div>

          {lockedIndex !== null ? (
            <>
              {examFlash && (
                <div
                  className={`exam-flash${
                    examFlash.kind === "correct"
                      ? " exam-flash-correct"
                      : examFlash.kind === "wrong"
                        ? " exam-flash-wrong"
                        : ""
                  }`}
                  role="status"
                  aria-live="polite"
                  style={{ marginTop: 18 }}
                >
                  <span className="exam-flash-icon" aria-hidden>
                    {examFlash.kind === "correct" ? "✓" : "✗"}
                  </span>
                  <span className="exam-flash-text">
                    {examFlash.kind === "correct" ? "Benar!" : "Kurang tepat"}
                  </span>
                  {examFlash.explanation ? (
                    <span className="exam-flash-detail">
                      <MathText text={examFlash.explanation} />
                    </span>
                  ) : null}
                </div>
              )}
              <div className="feedback feedback-waiting" style={{ marginTop: 18, marginBottom: 0, background: "rgba(99,102,241,0.1)", borderColor: "rgba(129,140,248,0.45)" }}>
                <p className="feedback-icon" aria-hidden>✓</p>
                <h2 className="feedback-title" style={{ fontSize: 21 }}>Jawaban terkirim!</h2>
                <p className="feedback-detail">
                  Jawabanmu: <strong>{question.options[lockedIndex]}</strong>
                  <br />
                  {you?.streak > 1 && (
                    <span className="streak-badge" style={{ marginTop: 8, display: "inline-flex" }}>
                      🔥 Streak {you.streak}
                    </span>
                  )}
                </p>
                <div style={{ width: "min(280px, 100%)", margin: "14px auto 6px" }}>
                  <div className="progressbar">
                    <div
                      className="progressbar-fill"
                      style={{
                        width: `${
                          state.playerCount > 0
                            ? Math.round((state.answeredCount / state.playerCount) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="feedback-detail" style={{ marginTop: 8, fontSize: 13 }}>
                    {state.answeredCount} / {state.playerCount} pemain sudah menjawab
                  </p>
                </div>
              </div>
            </>
          ) : (
            <p className="footer-note" style={{ marginTop: 18 }}>
              Pilih satu jawaban. Setelah terkirim, jawaban tidak bisa diubah lagi.
            </p>
          )}
        </QuestionCard>
      )}

      {/* ═══ SOAL (mode ujian) ═══ */}
      {phase === "question" && question && mode === "exam" && (
        <QuestionCard
          question={question}
          header={
            <>
              {header}
              <TotalTimeBar secondsLeft={totalSecondsLeft} totalSec={totalTimeLimit} />
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {state.secondsLeft !== null && state.secondsLeft !== undefined ? (
                  <Timer
                    secondsLeft={state.secondsLeft}
                    totalSec={question.timeSec}
                    resetKey={question.index}
                    variant="ring"
                    size={82}
                  />
                ) : null}
                <QuestionProgress
                  index={question.index}
                  total={progress?.total ?? state.totalQuestions}
                  answered={progress?.answered ?? null}
                />
              </div>
            </>
          }
        >
          <div className="options">
            {question.options.map((option, index) => {
              const isLocked = lockedIndex !== null
              const isChosen = lockedIndex === index
              return (
                <OptionButton
                  key={index}
                  index={index}
                  option={option}
                  image={question.optionImages?.[index] ?? null}
                  disabled={isLocked || sending}
                  className={isChosen ? "is-chosen" : ""}
                  onClick={() => onAnswer(index)}
                />
              )
            })}
          </div>

          {examFlash && (
            <div
              className={`exam-flash${
                examFlash.kind === "correct"
                  ? " exam-flash-correct"
                  : examFlash.kind === "wrong"
                    ? " exam-flash-wrong"
                    : ""
              }`}
              role="status"
              aria-live="polite"
            >
              <span className="exam-flash-icon" aria-hidden>
                {examFlash.kind === "correct" ? "✓" : examFlash.kind === "wrong" ? "✗" : "↑"}
              </span>
              <span className="exam-flash-text">
                {examFlash.kind === "correct"
                  ? "Benar!"
                  : examFlash.kind === "wrong"
                    ? "Kurang tepat"
                    : "Jawaban terkirim"}
              </span>
              {examFlash.explanation ? (
                <span className="exam-flash-detail">
                  <MathText text={examFlash.explanation} />
                </span>
              ) : null}
            </div>
          )}

          {!examFlash && lockedIndex === null && (
            <p className="footer-note" style={{ marginTop: 18 }}>
              Jawab sekarang atau tunggu waktu habis — soal akan otomatis berpindah.
              {settings.allowBack ? " Kamu boleh menengok soal sebelumnya." : ""}
            </p>
          )}

          {settings.allowBack && seen.length > 1 && (
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHistoryOpen(true)}>
                ◀ Lihat soal sebelumnya
              </button>
            </div>
          )}
        </QuestionCard>
      )}

      {/* ═══ REVEAL (mode live) ═══ */}
      {phase === "reveal" && question && reveal && (
        <>
          {reveal.yourAnswer === null ? (
            <div className="feedback" style={{ borderColor: "rgba(148,163,184,.35)" }}>
              <p className="feedback-icon" aria-hidden>⏱️</p>
              <h2 className="feedback-title">Tidak menjawab</h2>
              <p className="feedback-detail">
                Waktu habis sebelum kamu memilih. Jawaban benar:{" "}
                <strong>{question.options[reveal.correctIndex]}</strong>
              </p>
              <p className="feedback-points" style={{ color: "var(--text-muted)" }}>+0</p>
            </div>
          ) : reveal.yourAnswer === reveal.correctIndex ? (
            <div className="feedback feedback-correct">
              <p className="feedback-icon" aria-hidden>✓</p>
              <h2 className="feedback-title">Benar!</h2>
              <p className="feedback-detail">
                Jawaban kamu: <strong>{question.options[reveal.yourAnswer]}</strong>
                {you?.streak > 1 && (
                  <span className="streak-badge" style={{ marginLeft: 10 }}>🔥 Streak {you.streak}</span>
                )}
              </p>
              <p className="feedback-points">
                +{(reveal.yourPoints ?? 0).toLocaleString("id-ID")}
              </p>
              {reveal.correctPercent > 0 && (
                <p className="pct-big" style={{ marginTop: 6 }}>
                  {reveal.correctPercent}% pemain juga menjawab benar
                </p>
              )}
            </div>
          ) : (
            <div className="feedback feedback-wrong">
              <p className="feedback-icon" aria-hidden>✗</p>
              <h2 className="feedback-title">Kurang tepat</h2>
              <p className="feedback-detail">
                Jawaban kamu: <strong>{question.options[reveal.yourAnswer]}</strong>
                <br />
                Jawaban benar: <strong>{question.options[reveal.correctIndex]}</strong>
              </p>
              <p className="feedback-points" style={{ color: "var(--error)" }}>+0</p>
              {reveal.correctPercent > 0 && (
                <p className="pct-big" style={{ marginTop: 6 }}>
                  {reveal.correctPercent}% pemain menjawab benar
                </p>
              )}
            </div>
          )}

          {reveal.explanation ? (
            <div className="card" style={{ marginTop: 18 }}>
              <h2 className="card-title">Penjelasan</h2>
              <p className="card-hint" style={{ margin: 0 }}>
                <MathText text={reveal.explanation} />
              </p>
            </div>
          ) : null}

          <div className="card">
            <h2 className="card-title">Soal {question.index + 1} selesai</h2>
            <p className="card-hint"><MathText text={question.text} /></p>

            {question.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="question-image" src={question.image} alt="Gambar soal" />
            ) : null}

            <div className="options">
              {question.options.map((option, index) => {
                const isCorrect = index === reveal.correctIndex
                const isMine = index === reveal.yourAnswer
                return (
                  <OptionButton
                    key={index}
                    index={index}
                    option={option}
                    image={question.optionImages?.[index] ?? null}
                    disabled
                    className={[
                      isCorrect ? "is-reveal-correct" : "",
                      isMine && !isCorrect ? "is-chosen-wrong" : "",
                      isMine && isCorrect ? "is-chosen-correct" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  />
                )
              })}
            </div>

            <div className="you-panel">
              <div className="stat center">
                <span className="stat-value">{(you?.score ?? 0).toLocaleString("id-ID")}</span>
                <span className="stat-label">Skor totalmu</span>
              </div>
              <div className="stat center">
                <span className="stat-value">{you?.rank ? `#${you.rank}` : "—"}</span>
                <span className="stat-label">Peringkat saat ini</span>
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">Papan skor sementara</h2>
            <Leaderboard rows={leaderboard} youId={you?.playerId} trackRanks version={state.version} />
          </div>
        </>
      )}

      {/* ═══ SELESAI ═══ */}
      {phase === "finished" && (
        mode === "exam" ? (
          <ExamResults
            results={results}
            you={you}
            seen={seen}
            myAnswers={myAnswers}
          />
        ) : (
          <>
            <div className="card">
              <h1 className="card-title center">🏆 Hasil Akhir</h1>
              <p className="card-hint center">
                Posisi akhirmu: <strong>{you?.rank ? `#${you.rank}` : "—"}</strong> dari{" "}
                {state.playerCount} pemain · Skor{" "}
                <strong>{(you?.score ?? 0).toLocaleString("id-ID")}</strong>
              </p>
              <Podium rows={leaderboard} />
            </div>

            <div className="card">
              <h2 className="card-title">Peringkat lengkap</h2>
              <Leaderboard rows={leaderboard} youId={you?.playerId} limit={leaderboard.length} />
              <div className="btn-row" style={{ marginTop: 22, justifyContent: "center" }}>
                <Link href="/" className="btn">Main Lagi</Link>
                <Link href="/my-quizzes" className="btn">Kuis Saya</Link>
                <Link href="/editor/new" className="btn btn-primary">Buat Quiz Sendiri</Link>
              </div>
            </div>
          </>
        )
      )}

      {historyOpen && (
        <SeenQuestionsModal
          rows={seen}
          currentIndex={questionIndex}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HASIL UJIAN — nilai 0–100, lulus/tidak, waktu, pembahasan per soal
// ═══════════════════════════════════════════════════════════════════════════
//
// Sumber data: `results.myResult` + `results.perQuestion` (CONTRACT §6).
//
// "Jawabanmu" diambil dari `myAnswers` — peta indeks→pilihan yang dipegang
// pemain di MEMORI selama ujian berjalan (dia memang tahu apa yang dia pilih).
// Server TIDAK mengirim jawaban pribadi per soal di `results.perQuestion`, dan
// kita tidak menebaknya dari `optionCounts` (itu distribusi kelas). Bila peta
// memori kosong — mis. halaman di-refresh tepat sebelum ujian berakhir —
// barisnya ditulis "tidak tersedia" apa adanya, bukan dikarang.
// ═══════════════════════════════════════════════════════════════════════════
