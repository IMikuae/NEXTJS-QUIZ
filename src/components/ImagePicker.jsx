"use client"

import { useCallback, useEffect, useState } from "react"
import { MathText } from "@/components/MathText"
import { mathToPlainText } from "@/lib/math"

// ═══════════════════════════════════════════════════════════════════════════
// QUESTION IMAGE PICKER — unggah gambar soal / gambar opsi (CONTRACT §4)
// ═══════════════════════════════════════════════════════════════════════════
// Alur: berkas → dibaca jadi data URL base64 → POST /api/uploads →
// simpan `url` yang dibalas server ke question.image / optionImages[i].
// Yang tersimpan di draft hanya URL (/api/uploads/…), bukan base64 — supaya
// payload room tetap kecil (CONTRACT §4).
//
// Batas 2,5 MB setelah decode diperiksa DI SINI juga (server tetap penjaga
// terakhir) supaya pengguna tidak menunggu unggahan besar hanya untuk ditolak.
// ═══════════════════════════════════════════════════════════════════════════

export const MAX_UPLOAD_BYTES = 2.5 * 1024 * 1024

/** Nama berkas dari URL unggahan (untuk label). */
function fileNameOf(url) {
  if (typeof url !== "string") return ""
  const parts = url.split("/")
  return parts[parts.length - 1] || ""
}

/**
 * @param {{
 *   value: string|null,
 *   onChange: (url: string|null) => void,
 *   compact?: boolean,
 *   label?: string,
 * }} props
 */
export function ImagePicker({ value, onChange, compact = false, label = "Gambar" }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [zoomOpen, setZoomOpen] = useState(false)

  // Esc menutup pratinjau besar.
  useEffect(() => {
    if (!zoomOpen) return undefined
    const onKey = (event) => {
      if (event.key === "Escape") setZoomOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [zoomOpen])

  const onPick = useCallback(
    async (event) => {
      const file = event.target.files?.[0]
      event.target.value = "" // supaya berkas yang sama bisa dipilih lagi
      if (!file) return

      setError("")

      if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
        setError("Format harus PNG, JPG, GIF, atau WebP.")
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError("Gambar terlalu besar (maks 2,5 MB).")
        return
      }

      setBusy(true)

      let dataUrl
      try {
        dataUrl = await readAsDataUrl(file)
      } catch {
        setBusy(false)
        setError("Gambar tidak bisa dibaca.")
        return
      }

      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ data: dataUrl }),
      })

      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      setBusy(false)

      if (!response.ok) {
        setError(payload?.error || "Gagal mengunggah gambar.")
        return
      }

      if (typeof payload?.url !== "string") {
        setError("Server tidak mengirim URL gambar.")
        return
      }

      onChange(payload.url)
    },
    [onChange]
  )

  return (
    <div className={`img-picker${compact ? " is-compact" : ""}`}>
      {value ? (
        <>
          <button
            type="button"
            className="img-picker-thumb"
            onClick={() => setZoomOpen(true)}
            title="Klik untuk memperbesar"
            aria-label={`Perbesar ${label}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt={label} />
          </button>
          <div className="img-picker-actions">
            <span className="img-picker-name mono" title={value}>
              {fileNameOf(value)}
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(null)}>
              Hapus gambar
            </button>
          </div>
        </>
      ) : (
        <label className={`img-picker-drop${busy ? " is-busy" : ""}`}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={busy}
            onChange={onPick}
            className="visually-hidden"
          />
          {busy ? (
            <>
              <span className="spinner" aria-hidden /> Mengunggah…
            </>
          ) : (
            <>
              <span aria-hidden>🖼</span> {label} — pilih berkas
            </>
          )}
        </label>
      )}

      {error && (
        <p className="img-picker-error" role="alert">{error}</p>
      )}

      {zoomOpen && value && (
        <div
          className="img-zoom-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${label} diperbesar`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setZoomOpen(false)
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="img-zoom-img" />
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 14 }}
            onClick={() => setZoomOpen(false)}
          >
            Tutup
          </button>
        </div>
      )}
    </div>
  )
}

/** FileReader → data URL (promise). */
function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("read_failed"))
    reader.readAsDataURL(file)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// MATH PREVIEW — pratinjau render + tombol "lihat sebagai teks biasa"
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {{ text: string, label?: string }} props
 */
export function MathPreview({ text, label = "Pratinjau" }) {
  const [plain, setPlain] = useState(false)
  const hasText = String(text ?? "").trim().length > 0

  return (
    <div className="math-preview">
      <div className="math-preview-head">
        <span className="filter-group-title" style={{ margin: 0 }}>{label}</span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          aria-pressed={plain}
          onClick={() => setPlain((prev) => !prev)}
        >
          {plain ? "Lihat sebagai matematika" : "Lihat sebagai teks biasa"}
        </button>
      </div>

      <div className="math-preview-body">
        {!hasText ? (
          <span className="card-hint">Belum ada teks.</span>
        ) : plain ? (
          <span className="mono math-preview-plain">{mathToPlainText(text)}</span>
        ) : (
          <MathText text={text} />
        )}
      </div>
    </div>
  )
}
