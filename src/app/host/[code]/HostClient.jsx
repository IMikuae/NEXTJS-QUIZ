"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ConnectionPill } from "@/components/ConnectionPill"
import { Distribution } from "@/components/Distribution"
import { Leaderboard } from "@/components/Leaderboard"
import { MathText } from "@/components/MathText"
import { Podium } from "@/components/Podium"
import { describeSettings } from "@/components/QuizSettingsPanel"
import { loadHost, postJson, useRoomState } from "@/lib/room-client"
import { toast } from "@/lib/toast-store"
import { HostLobby } from "./HostLobby"
import { HostLive } from "./HostLive"
import { HostReport } from "./HostReport"
import { HostExam } from "./HostExam"

// ═══════════════════════════════════════════════════════════════════════════
// HOST CLIENT — orkestrator fase: lobby / live (question+reveal) / finished,
// plus jalur khusus mode ujian (exam) yang tidak punya fase reveal.
//
// Kontrol host yang tersedia (CONTRACT §6):
//   start · next · extend · skip   (perilaku lama)
//   end      → akhiri sesi sekarang (konfirmasi)
//   lock     → kunci / buka lobby (konfirmasi saat mengunci)
//   kick     → keluarkan satu pemain (konfirmasi)
//   restart  → reset skor & jawaban, kembali ke lobby (konfirmasi)
//   advance  → paksa lanjut di mode live (hanya mode live)
//
// Semua tombol destruktif memakai ConfirmDialog. "Soal Berikutnya"
// DISEMBUNYIKAN di mode ujian karena tidak berlaku (server membalas 409).
// `projector` (dari ?mode=projector) → kelas is-projector: font besar, UI minim.
// ═══════════════════════════════════════════════════════════════════════════

export default function HostClient({ code, projector = false }) {
  const [hostToken, setHostToken] = useState(null)
  const [tokenChecked, setTokenChecked] = useState(false)
  const [origin, setOrigin] = useState("")
  const [actionError, setActionError] = useState("")
  const [busyAction, setBusyAction] = useState("")

  // Token host dibaca dari sessionStorage (tab ini saja).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baca sessionStorage (external)
    setHostToken(loadHost(code))
    setTokenChecked(true)
    setOrigin(window.location.origin)
  }, [code])

  const auth = hostToken ? { hostToken } : null

  const { state, status, connection, refresh } = useRoomState(code, auth, {
    enabled: tokenChecked && Boolean(hostToken),
    onForbidden: useCallback(() => setActionError("Token host tidak valid."), []),
  })

  // ── Aksi host ────────────────────────────────────────────────────────────
  // `label` dipakai untuk menandai tombol mana yang sedang bekerja, supaya
  // tombol lain tetap bisa diklik dan pengguna tahu proses mana yang berjalan.
  const hostAction = useCallback(
    async (path, { label = path, body = {}, success = null } = {}) => {
      if (!hostToken || busyAction) return null
      setBusyAction(label)
      setActionError("")
      const result = await postJson(`/api/rooms/${code}/${path}`, { hostToken, ...body })
      setBusyAction("")
      if (!result.ok) {
        setActionError(result.error || "Aksi gagal. Coba lagi.")
        return null
      }
      if (success) toast.success(success)
      refresh()
      return result.data
    },
    [hostToken, busyAction, code, refresh]
  )

  const busy = busyAction !== ""

  // ── Kartu-kartu status khusus ────────────────────────────────────────────
  if (!tokenChecked) {
    return (
      <main className="page page-narrow">
        <div className="waiting">
          <span className="spinner" aria-hidden /> Menyiapkan panel host…
        </div>
      </main>
    )
  }

  if (!hostToken || status === "forbidden") {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
        </div>
        <div className="card center" style={{ marginTop: 48 }}>
          <p style={{ fontSize: 40, margin: 0 }} aria-hidden>🔒</p>
          <h1 className="card-title" style={{ marginTop: 14 }}>Kamu bukan host room ini</h1>
          <p className="card-hint" style={{ marginBottom: 22 }}>
            Token host untuk room <span className="mono">{code}</span> tidak ada di tab ini.
            Token host hanya tersimpan di tab tempat kuis dimainkan.
          </p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <Link href="/" className="btn btn-primary">Buat kuis baru</Link>
            <Link href={`/play/${code}`} className="btn">Gabung sebagai pemain</Link>
          </div>
        </div>
      </main>
    )
  }

  if (status === "not_found") {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
        </div>
        <div className="card center" style={{ marginTop: 48 }}>
          <p style={{ fontSize: 40, margin: 0 }} aria-hidden>🚫</p>
          <h1 className="card-title" style={{ marginTop: 14 }}>Room tidak ditemukan</h1>
          <p className="card-hint" style={{ marginBottom: 22 }}>
            Room <span className="mono">{code}</span> tidak ada atau sudah dibersihkan
            otomatis (room kedaluwarsa setelah 3 jam, dan state hilang bila server
            di-restart).
          </p>
          <Link href="/" className="btn btn-primary">Buat kuis baru</Link>
        </div>
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

  const joinUrl = `${origin}/play/${code}`
  const phase = state.phase
  const question = state.question
  const reveal = state.reveal
  const answeredIds = state.answeredPlayerIds || []
  const players = state.players || state.roster || []
  const leaderboard = state.leaderboard || []
  const settings = state.settings ?? {}
  const isExam = state.mode === "exam"
  const settingsText = describeSettings(settings).text
  const playerStates = state.playerStates ?? null

  // Tombol "Soal Berikutnya" hanya aktif kalau server bilang waktu sudah habis
  // ATAU soal sudah di-skip (masuk reveal). Server tetap menolak kalau dipaksa.
  const canAdvance = phase === "reveal" || (phase === "question" && (state.secondsLeft ?? 0) <= 0)
  const isLastQuestion = state.currentIndex >= state.totalQuestions - 1

  return (
    <main className={`page${projector ? " is-projector" : ""}`}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
        <div className="glow-blob glow-cyan" />
      </div>

      <ConnectionPill connection={connection} />

      {!projector && (
        <div className="brand">
          <span className="brand-dot" aria-hidden />
          Yue Quiz · {state.title}
        </div>
      )}

      {actionError && (
        <div className="alert alert-error" role="alert">
          {actionError}
        </div>
      )}

      {/* ═══ LOBBY ═══ */}
      {phase === "lobby" && (
        <>
          <HostLobby
            code={code}
            joinUrl={joinUrl}
            playerCount={state.playerCount}
            players={players}
            totalQuestions={state.totalQuestions}
            title={state.title}
            busy={busy}
            projector={projector}
            settings={settings}
            locked={Boolean(state.locked)}
            onStart={() => hostAction("start", { success: "Kuis dimulai" })}
          />
          <HostControls
            phase={phase}
            locked={Boolean(state.locked)}
            players={players}
            busy={busy}
            busyAction={busyAction}
            projector={projector}
            onAction={hostAction}
            compact
          />
        </>
      )}

      {/* ═══ SOAL BERJALAN (mode live) ═══ */}
      {phase === "question" && question && !isExam && (
        <HostLive
          state={state}
          question={question}
          players={players}
          answeredIds={answeredIds}
          busy={busy}
          busyAction={busyAction}
          canAdvance={canAdvance}
          projector={projector}
          onExtend={() =>
            hostAction("extend", { label: "extend" }).then((data) => {
              if (data) toast.info(`Waktu ditambah ${data.secondsLeft}s`)
            })
          }
          onSkip={() => hostAction("skip", { label: "skip", success: "Soal dilewati" })}
          onNext={() => hostAction("next", { label: "next" })}
          onAdvance={() => hostAction("advance", { label: "advance", success: "Dipaksa lanjut" })}
        />
      )}

      {/* ═══ SOAL BERJALAN (mode ujian) ═══ */}
      {phase === "question" && question && isExam && (
        <HostExam
          state={state}
          question={question}
          playerStates={playerStates}
          projector={projector}
          settingsText={settingsText}
        />
      )}

      {/* ═══ REVEAL (mode live) ═══ */}
      {phase === "reveal" && question && reveal && (
        <div className={projector ? "host-grid" : ""}>
          <div className="card">
            <span className="question-number">
              Hasil soal {question.index + 1} / {state.totalQuestions}
            </span>
            <h1
              className="card-title projector-q"
              style={{ fontSize: projector ? undefined : 22, lineHeight: 1.35, marginTop: 10 }}
            >
              <MathText text={question.text} />
            </h1>

            {question.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="question-image" src={question.image} alt="Gambar soal" />
            ) : null}

            <Distribution
              distribution={reveal.distribution}
              options={question.options}
              correctIndex={reveal.correctIndex}
              projector={projector}
            />

            {reveal.explanation ? (
              <div className="alert alert-info" style={{ marginTop: 16 }}>
                <strong>Penjelasan:</strong>{" "}
                <MathText text={reveal.explanation} />
              </div>
            ) : null}

            {reveal.fastest && (
              <p className="streak-badge" style={{ marginTop: 16 }}>
                ⚡ Pemain tercepat: {reveal.fastest.name} ·{" "}
                {(reveal.fastest.msTaken / 1000).toFixed(1)}s
              </p>
            )}

            <div className="counter-row">
              <div className="stat">
                <span className="stat-value">
                  {state.answeredCount}/{state.playerCount}
                </span>
                <span className="stat-label">Pemain menjawab</span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => hostAction("next", { label: "next" })}
              >
                {busyAction === "next" && <span className="spinner" aria-hidden />}
                {isLastQuestion ? "Lihat Hasil Akhir" : "Soal Berikutnya"}
              </button>
            </div>
          </div>

          {!projector && (
            <div className="card" style={{ marginTop: 20 }}>
              <h2 className="card-title">Papan skor sementara (top 10)</h2>
              <p className="card-hint">
                Panah ↑/↓ menunjukkan perubahan peringkat dari soal sebelumnya.
              </p>
              <Leaderboard
                rows={leaderboard}
                limit={10}
                trackRanks
                version={state.version}
                showMarks
              />
            </div>
          )}
        </div>
      )}

      {/* ═══ SELESAI ═══ */}
      {phase === "finished" && (
        <>
          <div className="card">
            <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
              <h1 className="card-title" style={{ margin: 0 }}>Kuis selesai 🎉</h1>
              <span className="tpl-badge">{isExam ? "Mode ujian" : "Mode live"}</span>
            </div>
            <p className="card-hint">
              {state.title} · {state.totalQuestions} soal · {state.playerCount} pemain
              {state.results?.averageGrade !== undefined
                ? ` · rata-rata nilai ${state.results.averageGrade}`
                : ""}
            </p>
            <Podium rows={leaderboard} />
          </div>

          {isExam && <HostExamResults results={state.results} code={code} />}

          {!isExam && <HostReport report={state.report} code={code} />}

          <div className="card">
            <h2 className="card-title">Peringkat lengkap</h2>
            <Leaderboard rows={leaderboard} limit={leaderboard.length} />
            <div className="btn-row" style={{ marginTop: 22, justifyContent: "center" }}>
              <Link href="/" className="btn btn-primary">Buat quiz baru</Link>
              {!projector && <Link href="/my-quizzes" className="btn">Kuis Saya</Link>}
            </div>
          </div>
        </>
      )}

      {/* ═══ KONTROL HOST (fase selain lobby) ═══ */}
      {phase !== "lobby" && (
        <HostControls
          phase={phase}
          locked={Boolean(state.locked)}
          players={players}
          busy={busy}
          busyAction={busyAction}
          projector={projector}
          onAction={hostAction}
        />
      )}
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// KONTROL HOST BARU — end · lock · restart · advance · kick
// ═══════════════════════════════════════════════════════════════════════════

function HostControls({
  phase,
  locked,
  players,
  busy,
  busyAction,
  projector,
  onAction,
  compact = false,
}) {
  const [confirm, setConfirm] = useState(null) // "end" | "restart" | { kick: player }

  const run = (label, path, options) => {
    setConfirm(null)
    onAction(path, { label, ...options })
  }

  const phaseLabel =
    phase === "lobby" ? "Lobby"
    : phase === "question" ? "Soal berjalan"
    : phase === "reveal" ? "Pembahasan"
    : "Selesai"

  return (
    <>
      <div className={`card glass-card host-controls${compact ? " is-compact" : ""}`}>
        <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Kontrol host</h2>
          <span className="stat-label">
            {phaseLabel}
            {locked ? " · terkunci" : ""}
            {players.length > 0 ? ` · ${players.length} pemain` : ""}
          </span>
        </div>

        <div className="host-control-grid">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() =>
              onAction("lock", {
                label: "lock",
                body: { locked: !locked },
                success: locked ? "Lobby dibuka" : "Lobby dikunci",
              })
            }
            title={locked ? "Buka kembali lobby supaya pemain bisa bergabung" : "Tutup lobby: pemain baru tidak bisa masuk"}
          >
            {busyAction === "lock" && <span className="spinner" aria-hidden />}
            {locked ? "🔓 Buka Kunci Lobby" : "🔒 Kunci Lobby"}
          </button>

          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setConfirm("restart")}
            title="Reset skor & jawaban semua pemain, kembali ke lobby (soal tetap)"
          >
            {busyAction === "restart" && <span className="spinner" aria-hidden />}
            ↺ Ulangi Sesi
          </button>

          {phase !== "finished" && (
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => setConfirm("end")}
              title="Akhiri sesi sekarang dan hitung hasil akhir"
            >
              {busyAction === "end" && <span className="spinner" aria-hidden />}
              ⏹ Akhiri Sesi
            </button>
          )}
        </div>

        {!projector && players.length > 0 && (
          <>
            <h3 className="filter-group-title" style={{ marginTop: 18 }}>Keluarkan pemain</h3>
            <div className="player-grid">
              {players.map((player) => (
                <span className="player-chip player-chip-colored kick-chip" key={player.id}>
                  <span className="player-avatar" aria-hidden>
                    {player.name.charAt(0).toUpperCase()}
                  </span>
                  {player.name}
                  <button
                    type="button"
                    className="kick-btn"
                    disabled={busy}
                    aria-label={`Keluarkan ${player.name}`}
                    title={`Keluarkan ${player.name} dari room`}
                    onClick={() => setConfirm({ kick: player })}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <p className="footer-note">
              Pemain yang dikeluarkan tidak bisa lagi membaca state room dengan
              tokennya, tapi bisa bergabung ulang selama lobby masih terbuka.
              {phase === "lobby" ? " “Mulai Kuis” ada di kartu kode room, di atas." : ""}
            </p>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === "end"}
        title="Akhiri sesi sekarang?"
        message="Kuis langsung berakhir dari fase apa pun, hasil akhir dihitung dan diarsipkan. Pemain tidak bisa lagi menjawab."
        confirmLabel="Akhiri sesi"
        onConfirm={() => run("end", "end", { success: "Sesi diakhiri" })}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm === "restart"}
        title="Ulangi sesi dari awal?"
        message="Semua skor dan jawaban pemain dihapus, dan room kembali ke lobby. Soal tetap sama. Pemain yang masih di halaman akan ikut kembali ke lobby."
        confirmLabel="Ulangi sesi"
        onConfirm={() => run("restart", "restart", { success: "Sesi diulang dari lobby" })}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={Boolean(confirm && confirm.kick)}
        title={`Keluarkan ${confirm?.kick?.name ?? "pemain"}?`}
        message="Token pemain itu langsung tidak berlaku. Dia masih bisa bergabung ulang dengan nama yang sama selama lobby belum dikunci."
        confirmLabel="Keluarkan"
        onConfirm={() =>
          run("kick", "kick", {
            body: { playerId: confirm.kick.id },
            success: `${confirm.kick.name} dikeluarkan`,
          })
        }
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// HASIL AKHIR MODE UJIAN UNTUK HOST — daftar pemain + rekap per soal + CSV
// ═══════════════════════════════════════════════════════════════════════════

function csvEscape(value) {
  const text = String(value ?? "")
  if (text.includes('"') || text.includes(";") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadExamCsv(results, code) {
  const header = ["Peringkat", "Nama", "Benar", "Salah", "Kosong", "Total", "Nilai", "Lulus", "Detik"]
  const rows = [header.join(";")]

  for (const row of results.perPlayer) {
    rows.push(
      [
        row.rank,
        csvEscape(row.name),
        row.correct,
        row.wrong,
        row.unanswered,
        row.total,
        row.grade,
        row.passed ? "Ya" : "Tidak",
        row.secondsUsed ?? "",
      ].join(";")
    )
  }

  rows.push("")
  rows.push(["No", "Soal", "Benar", "Dijawab", "Persen"].join(";"))
  for (const question of results.perQuestion) {
    rows.push(
      [
        question.index + 1,
        csvEscape(question.text),
        question.correctCount,
        question.answeredCount,
        `${question.correctPercent}%`,
      ].join(";")
    )
  }

  const csv = `﻿${rows.join("\r\n")}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `yue-quiz-ujian-${code}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function HostExamResults({ results, code }) {
  const [tab, setTab] = useState("players")

  if (!results) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 className="card-title">Hasil ujian</h2>
        <p className="card-hint">Rincian hasil belum tersedia dari server.</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Hasil ujian</h2>
        <button type="button" className="btn btn-sm" onClick={() => downloadExamCsv(results, code)}>
          ⬇ Export CSV
        </button>
      </div>

      <div className="metrics-grid" style={{ marginTop: 14 }}>
        <div className="stat-card">
          <span className="stat-value">{results.perPlayer.length}</span>
          <span className="stat-label">Pemain</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{results.averageGrade}</span>
          <span className="stat-label">Rata-rata nilai</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{results.passingScore}</span>
          <span className="stat-label">Nilai lulus</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">
            {results.perPlayer.filter((row) => row.passed).length}
          </span>
          <span className="stat-label">Lulus</span>
        </div>
      </div>

      <div className="tab-row" role="tablist" style={{ marginTop: 18 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "players"}
          className={`tab${tab === "players" ? " is-active" : ""}`}
          onClick={() => setTab("players")}
        >
          Per pemain
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "questions"}
          className={`tab${tab === "questions" ? " is-active" : ""}`}
          onClick={() => setTab("questions")}
        >
          Rekap per soal
        </button>
      </div>

      {tab === "players" ? (
        <div className="exam-table-wrap">
          <table className="exam-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Nama</th>
                <th scope="col">Benar</th>
                <th scope="col">Salah</th>
                <th scope="col">Kosong</th>
                <th scope="col">Nilai</th>
                <th scope="col">Hasil</th>
                <th scope="col">Waktu</th>
              </tr>
            </thead>
            <tbody>
              {results.perPlayer.map((row) => (
                <tr key={row.playerId} className={row.passed ? "is-passed" : "is-failed"}>
                  <td>{row.rank}</td>
                  <td>{row.name}</td>
                  <td>{row.correct}</td>
                  <td>{row.wrong}</td>
                  <td>{row.unanswered}</td>
                  <td>
                    <strong>{row.grade}</strong>
                  </td>
                  <td>{row.passed ? "Lulus" : "Belum"}</td>
                  <td>{row.secondsUsed !== null && row.secondsUsed !== undefined ? `${row.secondsUsed}s` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="exam-table-wrap">
          <table className="exam-table">
            <thead>
              <tr>
                <th scope="col">No</th>
                <th scope="col">Soal</th>
                <th scope="col">Benar</th>
                <th scope="col">Dijawab</th>
                <th scope="col">Persen</th>
              </tr>
            </thead>
            <tbody>
              {results.perQuestion.map((row) => (
                <tr key={row.index}>
                  <td>{row.index + 1}</td>
                  <td>
                    <MathText text={row.text} />
                  </td>
                  <td>{row.correctCount}</td>
                  <td>{row.answeredCount}</td>
                  <td>{row.correctPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="footer-note">
        Nilai = benar ÷ jumlah soal × 100. Lulus bila nilainya ≥ {results.passingScore}.
        CSV memuat dua tabel: per pemain dan rekap per soal.
      </p>
    </div>
  )
}
