"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { LoadingState, ErrorState } from "@/components/AsyncState"
import { EmptyState } from "@/components/EmptyState"
import { StatTile } from "@/components/StatTile"
import { CodeInput } from "@/components/CodeInput"
import { useAuth } from "@/lib/auth-store"
import { listQuizzes } from "@/lib/quiz-storage"
import { getJson, normalizeCodeInput, postJson, savePlayer } from "@/lib/room-client"
import { toast } from "@/lib/toast-store"
import { useRouter } from "next/navigation"

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — pusat aktivitas yang tampil BERBEDA menurut peran.
// ═══════════════════════════════════════════════════════════════════════════
//   • Guru/Admin : ringkasan kuis, template, sesi terakhir, aksi cepat.
//   • Siswa      : gabung lewat kode, aktivitas & riwayat singkat.
//   • Tamu       : ajakan masuk + gabung lewat kode.
//
// Semua angka berasal dari data nyata (localStorage untuk draft, API untuk
// template & arsip). Tidak ada statistik palsu.
// ═══════════════════════════════════════════════════════════════════════════

function formatDate(value) {
  if (!value) return "—"
  const iso = String(value).includes("T") ? value : `${String(value).replace(" ", "T")}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
}

export default function DashboardClient() {
  const router = useRouter()
  const { user, loaded } = useAuth()

  const [drafts, setDrafts] = useState(null)
  const [templates, setTemplates] = useState(null)
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState("")

  const [joinCode, setJoinCode] = useState("")
  const [joinName, setJoinName] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")

  const isTeacher = Boolean(user && (user.role === "guru" || user.role === "admin"))

  const load = useCallback(async () => {
    setError("")
    // Draft lokal selalu bisa dibaca.
    setDrafts(listQuizzes())

    if (!user) {
      setTemplates([])
      setSessions([])
      return
    }

    const [tplResult, archResult] = await Promise.all([
      getJson("/api/templates?mine=1"),
      getJson("/api/rooms/archive"),
    ])

    if (!tplResult.ok && !archResult.ok) {
      setError(tplResult.error || archResult.error || "Sebagian data tidak bisa dimuat.")
    }
    setTemplates(tplResult.ok && Array.isArray(tplResult.data?.templates) ? tplResult.data.templates : [])
    setSessions(archResult.ok && Array.isArray(archResult.data?.sessions) ? archResult.data.sessions : [])
  }, [user])

  useEffect(() => {
    if (!loaded) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat data dari storage & API (external)
    load()
  }, [loaded, load])

  const draftCount = drafts?.length ?? 0
  const templateCount = templates?.length ?? 0
  const sessionCount = sessions?.length ?? 0
  const recentDrafts = useMemo(() => (drafts ?? []).slice(0, 4), [drafts])
  const recentSessions = useMemo(() => (sessions ?? []).slice(0, 4), [sessions])

  const onJoin = useCallback(
    async (event) => {
      event.preventDefault()
      if (joining) return
      const code = normalizeCodeInput(joinCode)
      const name = joinName.trim()
      if (code.length !== 6) {
        setJoinError("Kode room harus 6 huruf.")
        return
      }
      if (name.length === 0 || name.length > 20) {
        setJoinError("Nama wajib 1–20 karakter.")
        return
      }
      setJoinError("")
      setJoining(true)
      const result = await postJson(`/api/rooms/${code}/join`, { name })
      setJoining(false)
      if (!result.ok) {
        setJoinError(result.error || "Gagal bergabung. Coba lagi.")
        return
      }
      const { playerId, token } = result.data || {}
      if (!playerId || !token) {
        setJoinError("Server tidak mengirim identitas pemain.")
        return
      }
      savePlayer(code, playerId, token, name)
      router.push(`/play/${code}`)
    },
    [joining, joinCode, joinName, router]
  )

  if (!loaded) {
    return <LoadingState label="Memuat dashboard…" marginTop={60} />
  }

  // ── Kartu gabung (dipakai siswa & tamu) ──
  const joinCard = (
    <form className="card glass-card" onSubmit={onJoin}>
      <h2 className="card-title">Gabung Quiz</h2>
      <p className="card-hint">
        Masukkan kode 6 huruf dari host, lalu namamu. Tidak perlu akun.
      </p>
      {joinError && <ErrorState message={joinError} />}
      <div className="field">
        <span className="label">Kode room</span>
        <CodeInput value={joinCode} onChange={setJoinCode} disabled={joining} />
      </div>
      <label className="field">
        <span className="label">Namamu</span>
        <input
          type="text"
          className="input"
          value={joinName}
          maxLength={20}
          disabled={joining}
          placeholder="Mis. Andi"
          onChange={(event) => setJoinName(event.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary btn-block" disabled={joining}>
        {joining && <span className="spinner" aria-hidden />}
        {joining ? "Bergabung…" : "Gabung ke room"}
      </button>
    </form>
  )

  return (
    <main className="page" style={{ maxWidth: 1120 }}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <div>
          <h1 className="page-title" style={{ fontSize: "clamp(26px, 5vw, 38px)", margin: 0 }}>
            {isTeacher ? "Dashboard Guru" : user ? "Dashboard Siswa" : "Dashboard"}
          </h1>
          <p className="footer-note" style={{ margin: "6px 0 0", textAlign: "left" }}>
            {user ? (
              <>Masuk sebagai <strong>{user.name}</strong></>
            ) : (
              <>Kamu belum masuk — draft tersimpan sebagai tamu di perangkat ini.</>
            )}
          </p>
        </div>
        {isTeacher && (
          <Link href="/editor/new" className="btn btn-primary">+ Buat Quiz</Link>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} marginTop={14} />}

      {/* ═══ RINGKASAN GURU ═══ */}
      {isTeacher && (
        <>
          <div className="metrics-grid" style={{ marginTop: 22 }}>
            <StatTile value={drafts === null ? "—" : draftCount} label="Kuis (draft)" />
            <StatTile value={templates === null ? "—" : templateCount} label="Template saya" />
            <StatTile value={sessions === null ? "—" : sessionCount} label="Sesi selesai" />
          </div>

          <div className="grid-2" style={{ marginTop: 22, alignItems: "start" }}>
            <div className="card glass-card">
              <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                <h2 className="card-title" style={{ margin: 0 }}>Kuis terakhir diedit</h2>
                <Link href="/my-quizzes" className="link" style={{ fontSize: 14 }}>Lihat semua →</Link>
              </div>
              {drafts === null ? (
                <LoadingState inline label="Memuat…" marginTop={12} />
              ) : recentDrafts.length === 0 ? (
                <p className="card-hint">Belum ada kuis. Mulai dari editor.</p>
              ) : (
                <ul className="leaderboard" style={{ marginTop: 10 }}>
                  {recentDrafts.map((quiz) => (
                    <li key={quiz.id}>
                      <span className="leaderboard-name" title={quiz.title}>{quiz.title}</span>
                      <span className="leaderboard-meta">
                        <span className="pct-big">{quiz.questions?.length ?? 0} soal</span>
                        <Link href={`/editor/${quiz.id}`} className="btn btn-sm btn-ghost">Buka</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card glass-card">
              <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                <h2 className="card-title" style={{ margin: 0 }}>Sesi terakhir</h2>
                <Link href="/riwayat" className="link" style={{ fontSize: 14 }}>Riwayat →</Link>
              </div>
              {sessions === null ? (
                <LoadingState inline label="Memuat…" marginTop={12} />
              ) : recentSessions.length === 0 ? (
                <p className="card-hint">Belum ada sesi selesai.</p>
              ) : (
                <ul className="leaderboard" style={{ marginTop: 10 }}>
                  {recentSessions.map((row) => (
                    <li key={row.code}>
                      <span className="leaderboard-name" title={row.title}>{row.title || row.code}</span>
                      <span className="leaderboard-meta">
                        <span className="pct-big">{row.playerCount} pemain</span>
                        <span className="pct-big">{formatDate(row.endedAt)}</span>
                        <Link href="/riwayat" className="btn btn-sm btn-ghost">Detail</Link>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="btn-row" style={{ marginTop: 20 }}>
            <Link href="/templates" className="btn">📚 Jelajahi Template</Link>
            <Link href="/riwayat" className="btn">🗂 Riwayat Sesi</Link>
            {/* Panel Admin hanya untuk peran admin — sebelumnya tampil juga
                untuk guru (padahal halamannya menolak non-admin). */}
            {user?.role === "admin" && (
              <Link href="/admin" className="btn btn-ghost">Panel Admin</Link>
            )}
          </div>
        </>
      )}

      {/* ═══ SISWA ═══ */}
      {user && !isTeacher && (
        <>
          <div className="grid-2" style={{ marginTop: 22, alignItems: "start" }}>
            {joinCard}
            <div className="card glass-card">
              <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                <h2 className="card-title" style={{ margin: 0 }}>Riwayat hasil</h2>
              </div>
              {sessions === null ? (
                <LoadingState inline label="Memuat…" marginTop={12} />
              ) : sessions.length === 0 ? (
                <p className="card-hint">
                  Belum ada hasil. Setelah mengerjakan kuis, hasilmu muncul di sini.
                </p>
              ) : (
                <ul className="leaderboard" style={{ marginTop: 10 }}>
                  {recentSessions.map((row) => (
                    <li key={row.code}>
                      <span className="leaderboard-name" title={row.title}>{row.title || row.code}</span>
                      <span className="leaderboard-meta">
                        <span className="pct-big">{formatDate(row.endedAt)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="footer-note" style={{ marginTop: 14, textAlign: "left" }}>
                Kelas: <strong>{user.kelas || "—"}</strong>
              </p>
            </div>
          </div>
        </>
      )}

      {/* ═══ TAMU ═══ */}
      {!user && (
        <div className="grid-2" style={{ marginTop: 22, alignItems: "start" }}>
          {joinCard}
          <div className="card glass-card">
            <h2 className="card-title">Masuk untuk menyimpan progres</h2>
            <p className="card-hint">
              Sebagai tamu, draft kuis tersimpan di browser ini saja. Masuk agar
              template, riwayat, dan hasil tersimpan di akunmu.
            </p>
            <div className="btn-row">
              <Link href="/masuk" className="btn btn-primary">Masuk / Daftar</Link>
              <Link href="/templates" className="btn btn-ghost">Lihat Template</Link>
            </div>
          </div>
        </div>
      )}

      {!isTeacher && !user && drafts !== null && draftCount > 0 && (
        <p className="footer-note" style={{ marginTop: 20, textAlign: "left" }}>
          Kamu punya {draftCount} draft lokal di perangkat ini.
        </p>
      )}

      {isTeacher && draftCount === 0 && templateCount === 0 && sessionCount === 0 ? (
        <div style={{ marginTop: 24 }}>
          <EmptyState
            icon="🚀"
            title="Mulai aktivitas pertamamu"
            description="Buat kuis, simpan sebagai template, lalu mainkan bersama kelas."
          >
            <Link href="/editor/new" className="btn btn-primary">+ Buat Quiz</Link>
          </EmptyState>
        </div>
      ) : null}
    </main>
  )
}
