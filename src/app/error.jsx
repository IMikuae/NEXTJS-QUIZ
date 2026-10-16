"use client"

import { useEffect } from "react"
import Link from "next/link"

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // Hanya catat pesannya — jangan pernah menulis token host/pemain ke log.
    console.error("[yue-quiz] error:", error?.message)
  }, [error])

  return (
    <main className="page page-narrow">
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="card center" style={{ marginTop: 60 }}>
        <p style={{ fontSize: 40, margin: 0 }} aria-hidden>
          ⚠️
        </p>
        <h1 className="card-title" style={{ marginTop: 16 }}>
          Terjadi kesalahan
        </h1>
        <p className="card-hint" style={{ marginBottom: 24 }}>
          Sesuatu berjalan tidak semestinya. Coba muat ulang halaman ini.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <button type="button" onClick={reset} className="btn btn-primary">
            Coba lagi
          </button>
          <Link href="/" className="btn">
            Ke halaman utama
          </Link>
        </div>
      </div>
    </main>
  )
}
