"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { ErrorState, LoadingState } from "@/components/AsyncState"
import { Modal } from "@/components/Modal"
import { useAuth } from "@/lib/auth-store"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// RIWAYAT SESI — daftar arsip sesi yang sudah berakhir (rooms_archive).
// ═══════════════════════════════════════════════════════════════════════════
// Memuat GET /api/rooms/archive (host: miliknya sendiri, admin: semua),
// menampilkan ringkasan, membuka detail (termasuk rekap per soal), dan
// menghapus arsip dengan konfirmasi.
// ═══════════════════════════════════════════════════════════════════════════

function formatDate(value) {
  if (!value) return "—"
  // SQLite menyimpan "YYYY-MM-DD HH:MM:SS" (UTC). Tambah "Z" agar dibaca UTC.
  const iso = String(value).includes("T") ? value : `${String(value).replace(" ", "T")}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Escape satu sel CSV: kutip bila memuat pemisah/kutip/baris baru. */
function csvEscape(value) {
  const text = String(value ?? "")
  if (text.includes('"') || text.includes(";") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/**
 * Unduh rekap satu sesi sebagai CSV (pemisah ";" + BOM UTF-8 agar Excel
 * Windows langsung benar). Memuat dua bagian: hasil per pemain dan rekap per
 * soal — keduanya berasal dari `summary` arsip yang nyata.
 */
function downloadSessionCsv(session) {
  const results = session.summary?.results
  if (!results) return false

  const lines = []
  lines.push(["Sesi", session.title || session.code].join(";"))
  lines.push(["Kode", session.code].join(";"))
  lines.push(["Mode", session.mode === "exam" ? "Ujian" : "Live"].join(";"))
  lines.push(["Selesai", formatDate(session.endedAt)].join(";"))
  lines.push("")

  lines.push("HASIL PER PEMAIN")
  lines.push(["Peringkat", "Nama", "Benar", "Salah", "Tidak dijawab", "Nilai", "Lulus"].join(";"))
  for (const p of results.perPlayer ?? []) {
    lines.push(
      [
        p.rank,
        csvEscape(p.name),
        p.correct,
        p.wrong,
        p.unanswered,
        p.grade,
        p.passed ? "Ya" : "Tidak",
      ].join(";")
    )
  }

  lines.push("")
  lines.push("REKAP PER SOAL")
  lines.push(["No", "Soal", "Dijawab", "Benar", "Persen"].join(";"))
  for (const q of results.perQuestion ?? []) {
    lines.push([q.index + 1, csvEscape(q.text), q.answeredCount, q.correctCount, `${q.correctPercent}%`].join(";"))
  }

  const csv = `\ufeff${lines.join("\r\n")}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `yue-quiz-${session.code}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
  return true
}

export default function RiwayatClient() {
  const { user, loaded } = useAuth()
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState("")
  const [detail, setDetail] = useState(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setError("")
    try {
      const response = await fetch("/api/rooms/archive", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error || "Riwayat sesi tidak bisa dimuat.")
        setSessions([])
        return
      }
      setSessions(payload.sessions ?? [])
    } catch {
      setError("Riwayat sesi tidak bisa dimuat.")
      setSessions([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat riwayat dari API setelah auth (external)
    if (loaded && user) load()
  }, [loaded, user, load])

  const openDetail = useCallback(async (code) => {
    setDetailBusy(true)
    setDetail({ code, loading: true })
    try {
      const response = await fetch(`/api/rooms/archive/${code}`, { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(payload?.error || "Detail sesi tidak bisa dimuat.")
        setDetail(null)
        return
      }
      setDetail(payload.session)
    } catch {
      toast.error("Detail sesi tidak bisa dimuat.")
      setDetail(null)
    } finally {
      setDetailBusy(false)
    }
  }, [])

  const remove = useCallback(
    async (code) => {
      setDeleting(true)
      try {
        const response = await fetch(`/api/rooms/archive/${code}`, { method: "DELETE" })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          toast.error(payload?.error || "Riwayat gagal dihapus.")
          return
        }
        setSessions((prev) => (prev ? prev.filter((row) => row.code !== code) : prev))
        toast.success("Riwayat dihapus.")
      } catch {
        toast.error("Riwayat gagal dihapus.")
      } finally {
        setDeleting(false)
      }
    },
    []
  )

  if (loaded && !user) {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
        </div>
        <div className="card center" style={{ marginTop: 50 }}>
          <h1 className="card-title">Riwayat Sesi</h1>
          <p className="card-hint">
            Masuk dulu untuk melihat riwayat sesi kuis yang pernah kamu pandu.
          </p>
          <Link href="/masuk" className="btn btn-primary">Masuk</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page" style={{ maxWidth: 1120 }}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <div>
          <h1 className="page-title" style={{ fontSize: "clamp(26px, 5vw, 38px)", margin: 0 }}>
            Riwayat Sesi
          </h1>
          <p className="footer-note" style={{ margin: "6px 0 0", textAlign: "left" }}>
            {user?.role === "admin"
              ? "Semua sesi dari seluruh akun."
              : "Sesi yang pernah kamu pandu, lengkap dengan hasil akhirnya."}
          </p>
        </div>
        <button type="button" className="btn" onClick={load}>↻ Muat ulang</button>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {sessions === null ? (
        <LoadingState inline label="Memuat riwayat…" marginTop={30} />
      ) : sessions.length === 0 ? (
        <div style={{ marginTop: 26 }}>
          <EmptyState
            title="Belum ada sesi"
            description="Sesi yang sudah selesai akan muncul di sini otomatis. Mulai kuis dari editor untuk mengisi riwayat."
          />
        </div>
      ) : (
        <div style={{ marginTop: 22 }}>
          {sessions.map((row) => (
            <div className="archive-row" key={row.code}>
              <div className="archive-main">
                <h2 className="archive-title">{row.title || "(tanpa judul)"}</h2>
                <div className="archive-meta">
                  <span>Kode <span className="mono">{row.code}</span></span>
                  <span>{row.mode === "exam" ? "Mode ujian" : "Mode live"}</span>
                  <span>{formatDate(row.endedAt)}</span>
                </div>
              </div>

              <div className="archive-stats">
                <div className="archive-stat">
                  <span className="archive-stat-value">{row.playerCount}</span>
                  <span className="archive-stat-label">Pemain</span>
                </div>
                <div className="archive-stat">
                  <span className="archive-stat-value">
                    {row.averageGrade === null ? "—" : row.averageGrade}
                  </span>
                  <span className="archive-stat-label">Rata-rata nilai</span>
                </div>
              </div>

              <div className="btn-row">
                <button type="button" className="btn btn-sm" onClick={() => openDetail(row.code)}>
                  Lihat detail
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => setConfirm(row)}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title || "Detail sesi"}
        maxWidth={760}
      >
        {detail?.loading ? (
          <p className="card-hint"><span className="spinner" aria-hidden /> Memuat detail…</p>
        ) : detail ? (
          <>
            <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
              <p className="card-hint" style={{ margin: 0 }}>
                Kode <span className="mono">{detail.code}</span> ·{" "}
                {detail.mode === "exam" ? "Mode ujian" : "Mode live"} · {formatDate(detail.endedAt)}
              </p>
              {detail.summary?.results && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    if (downloadSessionCsv(detail)) toast.success("CSV diunduh", detail.code)
                    else toast.error("Tidak ada data untuk diekspor")
                  }}
                >
                  ⬇ Export CSV
                </button>
              )}
            </div>

            <h3 className="filter-group-title" style={{ marginTop: 18 }}>Hasil per pemain</h3>
            {detail.summary?.results?.perPlayer?.length ? (
              <div className="exam-table-wrap">
                <table className="exam-table">
                  <thead>
                    <tr>
                      <th>#</th><th>Nama</th><th>Benar</th><th>Salah</th><th>Nilai</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.summary.results.perPlayer.map((p) => (
                      <tr key={p.playerId} className={p.passed ? "is-passed" : "is-failed"}>
                        <td>{p.rank}</td>
                        <td>{p.name}</td>
                        <td>{p.correct}</td>
                        <td>{p.wrong}</td>
                        <td>{p.grade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="card-hint">Tidak ada data pemain.</p>
            )}

            <h3 className="filter-group-title" style={{ marginTop: 20 }}>Rekap per soal</h3>
            {detail.summary?.results?.perQuestion?.length ? (
              detail.summary.results.perQuestion.map((q) => (
                <div className="report-row" key={q.index}>
                  <span className="question-number">{String(q.index + 1).padStart(2, "0")}</span>
                  <div style={{ minWidth: 0 }}>
                    <span className="qlist-text" style={{ display: "block", color: "var(--text-primary)", fontSize: 14 }}>
                      {q.text}
                    </span>
                    <div className="report-bar">
                      <div
                        className={`report-bar-fill${q.correctPercent < 50 ? " is-low" : ""}`}
                        style={{ width: `${q.correctPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className="pct-big" style={{ color: q.correctPercent >= 50 ? "var(--success)" : "#fca5a5" }}>
                    {q.correctPercent}%
                  </span>
                </div>
              ))
            ) : (
              <p className="card-hint">Tidak ada data soal.</p>
            )}
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Hapus riwayat sesi ini?"
        message={`Arsip sesi ${confirm?.code ?? ""} akan dihapus permanen. Hasil kuis tidak bisa dikembalikan.`}
        confirmLabel={deleting ? "Menghapus…" : "Hapus riwayat"}
        onConfirm={() => {
          const row = confirm
          setConfirm(null)
          if (row) remove(row.code)
        }}
        onCancel={() => setConfirm(null)}
      />
    </main>
  )
}
