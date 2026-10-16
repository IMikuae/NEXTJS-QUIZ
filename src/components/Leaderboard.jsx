"use client"

import { useEffect, useRef, useState } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// LEADERBOARD — daftar peringkat bersama (host + pemain).
//
// trackRanks: bandingkan peringkat dengan snapshot polling SEBELUMNYA, lalu
// tampilkan panah ↑/↓ + kilat indigo pada baris yang berubah. Snapshot
// disimpan di ref dan diperbarui SETELAH render (di dalam effect), sehingga
// perbandingan selalu antar-data (bukan antar-render).
//
// `flash` disimpan sebagai state + dibersihkan lewat timeout 1.5 detik supaya
// penanda tetap terlihat walau komponen re-render karena hal lain (polling
// berikutnya datang 1 detik kemudian).
// ═══════════════════════════════════════════════════════════════════════════

export function Leaderboard({
  rows,
  youId,
  limit = 10,
  trackRanks = false,
  version = 0,
  showMarks = false,
}) {
  const prevRanksRef = useRef(null)
  const [flash, setFlash] = useState({})

  useEffect(() => {
    if (!trackRanks || !rows) return undefined

    const current = new Map(rows.map((row) => [row.playerId, row.rank]))
    const prev = prevRanksRef.current
    const changes = {}

    if (prev) {
      for (const [playerId, rank] of current) {
        const before = prev.get(playerId)
        if (before !== undefined && before !== rank) {
          changes[playerId] = before > rank ? "up" : "down"
        }
      }
    }

    prevRanksRef.current = current

    if (Object.keys(changes).length === 0) return undefined

    // eslint-disable-next-line react-hooks/set-state-in-effect -- sorotan perubahan peringkat dari data server
    setFlash(changes)
    const timer = setTimeout(() => setFlash({}), 1500)
    return () => clearTimeout(timer)
  }, [trackRanks, rows, version])

  if (!rows || rows.length === 0) {
    return <p className="card-hint">Belum ada pemain.</p>
  }

  const shown = rows.slice(0, limit)

  return (
    <ul className="leaderboard">
      {shown.map((row) => {
        const isYou = youId != null && row.playerId === youId
        const direction = flash[row.playerId]

        const classes = []
        if (isYou) classes.push("is-you")
        if (direction) classes.push("is-rank-flash")

        return (
          <li key={row.playerId} className={classes.filter(Boolean).join(" ")}>
            <span className={`rank-badge rank-${row.rank}`}>{row.rank}</span>
            <span className="leaderboard-name" title={row.name}>
              {row.name}
              {isYou ? " (kamu)" : ""}
            </span>
            <span className="leaderboard-meta">
              {direction === "up" && <span className="rank-up" title="Naik peringkat">↑</span>}
              {direction === "down" && <span className="rank-down" title="Turun peringkat">↓</span>}
              {showMarks && row.correct === true && (
                <span className="mark-correct" title="Jawaban benar">✓</span>
              )}
              {showMarks && row.correct === false && (
                <span className="mark-wrong" title="Jawaban salah">✗</span>
              )}
              <span className="leaderboard-score">{row.score.toLocaleString("id-ID")}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
