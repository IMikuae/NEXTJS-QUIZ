"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Timer countdown untuk soal — dua varian tampilan:
 *
 *   variant="bar"  (default) — angka besar + bar linear (kompatibel lama)
 *   variant="ring"           — progress ring melingkar + angka di tengah,
 *                              pulse saat ≤5 dtk (is-warning) dan lebih kuat
 *                              saat ≤3 dtk (is-critical). Dipakai host & pemain.
 *
 * PENTING — sumber kebenaran tetap SERVER:
 *   `secondsLeft` datang dari respons API (dihitung dari `questionDeadline`
 *   milik server). Komponen ini hanya meng-tick tampilan setiap 250ms supaya
 *   angkanya bergerak halus, lalu "menyerahkan diri" ke nilai server setiap
 *   kali prop `secondsLeft` berubah (yaitu setiap polling 1 detik).
 *
 *   Host menekan "+10 Detik"? secondsLeft naik dari server → deadlineRef
 *   di-set ulang otomatis — tidak perlu logika khusus di sini.
 *
 * @param {{
 *   secondsLeft: number|null,   // dari server; null bila bukan fase question
 *   totalSec: number,           // durasi soal, untuk proporsi ring/bar
 *   resetKey?: string|number,   // berubah → timer dimulai ulang (ganti soal)
 *   compact?: boolean,          // (bar) sembunyikan bar
 *   variant?: "bar"|"ring",
 *   size?: number,              // (ring) diameter px
 * }} props
 */
export function Timer({ secondsLeft, totalSec, resetKey, compact = false, variant = "bar", size = 110 }) {
  const [display, setDisplay] = useState(secondsLeft ?? 0)
  const deadlineRef = useRef(null)

  // Setiap kali server mengirim angka baru, jadikan itu acuan lokal.
  useEffect(() => {
    if (secondsLeft === null || secondsLeft === undefined) {
      deadlineRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron dari prop server
      setDisplay(0)
      return
    }
    deadlineRef.current = Date.now() + secondsLeft * 1000
    setDisplay(secondsLeft)
  }, [secondsLeft, resetKey])

  // Tick 250ms hanya untuk kehalusan tampilan.
  useEffect(() => {
    const id = setInterval(() => {
      if (deadlineRef.current === null) return
      const remaining = Math.max(0, deadlineRef.current - Date.now())
      setDisplay(Math.ceil(remaining / 1000))
    }, 250)
    return () => clearInterval(id)
  }, [])

  if (secondsLeft === null || secondsLeft === undefined) return null

  const tone =
    display <= 3 ? " is-critical" : display <= Math.max(5, Math.ceil(totalSec * 0.3)) ? " is-warning" : ""

  // ══ Varian RING ══
  if (variant === "ring") {
    const stroke = 8
    const radius = (size - stroke) / 2
    const circumference = 2 * Math.PI * radius
    const ratio = totalSec > 0 ? Math.max(0, Math.min(1, display / totalSec)) : 0
    const fontSize = Math.max(20, Math.round(size * 0.3))

    return (
      <div
        className={`timer-ring${tone}`}
        style={{ width: size, height: size }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSec}
        aria-valuenow={display}
        aria-label="Sisa waktu soal"
      >
        <svg width={size} height={size}>
          <circle className="timer-ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
          <circle
            className="timer-ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        </svg>
        <span className="timer-ring-value" style={{ fontSize }}>
          {display}
        </span>
      </div>
    )
  }

  // ══ Varian BAR (lama, tetap dipakai bila ring tidak pas) ══
  const barRatio = totalSec > 0 ? Math.max(0, Math.min(1, display / totalSec)) : 0

  return (
    <div>
      <div className="timer">
        <span className={`timer-value${tone}`}>{display}</span>
        <span className="timer-unit">detik</span>
      </div>
      {!compact && (
        <div
          className="timer-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSec}
          aria-valuenow={display}
          aria-label="Sisa waktu soal"
        >
          <div
            className={`timer-bar-fill${display <= 3 ? " is-critical" : ""}`}
            style={{ width: `${barRatio * 100}%` }}
          />
        </div>
      )}
    </div>
  )
}
