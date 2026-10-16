"use client"

import { useCallback, useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE LIBRARY — panel "Kelola gambar" untuk editor
// ═══════════════════════════════════════════════════════════════════════════
// Memuat daftar unggahan akun (GET /api/uploads), menampilkan kuota, dan
// mengizinkan penghapusan (DELETE /api/uploads/[file]) dengan konfirmasi.
//
// Ini menutup fitur yang sebelumnya setengah jadi: kuota 100 gambar sudah
// ditegakkan server, tapi tidak ada cara menghapus gambar — sehingga akun
// yang penuh terkunci permanen meski pesan galatnya menyuruh menghapus.
// ═══════════════════════════════════════════════════════════════════════════

export function ImageLibrary({ open = false }) {
  const [rows, setRows] = useState(null) // null = belum dimuat
  const [limit, setLimit] = useState(100)
  const [error, setError] = useState("")
  const [busyId, setBusyId] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const load = useCallback(async () => {
    setError("")
    try {
      const response = await fetch("/api/uploads", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error || "Daftar gambar tidak bisa dimuat.")
        setRows([])
        return
      }
      setRows(payload.uploads ?? [])
      if (Number.isInteger(payload.limit)) setLimit(payload.limit)
    } catch {
      setError("Daftar gambar tidak bisa dimuat.")
      setRows([])
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat daftar gambar dari API (external)
    if (open) load()
  }, [open, load])

  const remove = useCallback(async (row) => {
    setBusyId(row.id)
    try {
      const response = await fetch(`/api/uploads/${row.id}.${row.ext}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(payload?.error || "Gambar gagal dihapus.")
        return
      }
      setRows((prev) => (prev ? prev.filter((item) => item.id !== row.id) : prev))
      toast.success("Gambar dihapus.")
    } catch {
      toast.error("Gambar gagal dihapus.")
    } finally {
      setBusyId(null)
    }
  }, [])

  if (!open) return null

  return (
    <div className="img-library">
      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <h3 className="filter-group-title" style={{ margin: 0 }}>Kelola gambar</h3>
        <span className="stat-label">
          {rows ? `${rows.length} / ${limit}` : "memuat…"}
        </span>
      </div>

      {error && <p className="img-picker-error" role="alert">{error}</p>}

      {rows === null ? (
        <p className="card-hint"><span className="spinner" aria-hidden /> Memuat gambar…</p>
      ) : rows.length === 0 ? (
        <p className="card-hint">Belum ada gambar yang diunggah.</p>
      ) : (
        <div className="img-library-grid">
          {rows.map((row) => (
            <figure className="img-library-item" key={row.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.url} alt="Gambar unggahan" loading="lazy" />
              <button
                type="button"
                className="img-library-del"
                disabled={busyId === row.id}
                aria-label="Hapus gambar ini"
                title="Hapus gambar ini"
                onClick={() => setConfirm(row)}
              >
                {busyId === row.id ? <span className="spinner" aria-hidden /> : "✕"}
              </button>
            </figure>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Hapus gambar ini?"
        message="Gambar yang masih dipakai di soal akan tampil kosong. Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Hapus gambar"
        onConfirm={() => {
          const row = confirm
          setConfirm(null)
          if (row) remove(row)
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
