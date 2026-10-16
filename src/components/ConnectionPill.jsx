"use client"

import { useEffect, useRef, useState } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION PILL — tampil HANYA saat polling bermasalah (connection "down"),
// lalu konfirmasi singkat "✓ Koneksi kembali" setelah pulih.
//
// Tidak menelan error jaringan secara diam-diam lagi: pengguna tahu koneksi
// putus dan akan kembali otomatis. State UI lama TIDAK di-reset, jadi layar
// tidak blank — pill hanya overlay kecil di atas.
//
// PENTING: konfirmasi "kembali" hanya muncul kalau sebelumnya MEMANG "down".
// Tanpa penjagaan itu, pill akan berkedip "Koneksi kembali" setiap kali
// halaman dibuka (karena connection mulai dari "ok").
// ═══════════════════════════════════════════════════════════════════════════

export function ConnectionPill({ connection }) {
  const [recovered, setRecovered] = useState(false)
  const wasDownRef = useRef(false)

  useEffect(() => {
    if (connection === "down") {
      wasDownRef.current = true
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron dari prop koneksi (external)
      setRecovered(false)
      return undefined
    }

    // "ok": tampilkan konfirmasi hanya bila sebelumnya sempat putus.
    if (!wasDownRef.current) return undefined
    wasDownRef.current = false
    setRecovered(true)
    const timer = setTimeout(() => setRecovered(false), 2600)
    return () => clearTimeout(timer)
  }, [connection])

  if (connection === "down") {
    return (
      <div className="conn-pill" role="alert">
        <span className="spinner" aria-hidden />
        Koneksi bermasalah — mencoba terhubung kembali…
      </div>
    )
  }

  if (recovered) {
    return (
      <div className="conn-pill" role="status">
        ✓ Koneksi kembali
      </div>
    )
  }

  return null
}
