"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Salin teks ke clipboard dengan fallback untuk browser/konteks yang tidak
 * punya Clipboard API (mis. halaman non-HTTPS di jaringan lokal).
 *
 * @param {string} text
 * @returns {Promise<boolean>} berhasil atau tidak
 */
export async function copyText(text) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // jatuh ke fallback di bawah
    }
  }

  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.top = "-1000px"
    area.style.opacity = "0"
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand("copy")
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

/**
 * Tombol salin dengan status "✓ Tersalin!" selama 2 detik.
 *
 * @param {{ value: string, label?: string, className?: string, title?: string }} props
 */
export function CopyButton({ value, label = "Copy", className = "", title }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    if (!failed) return undefined
    const timer = setTimeout(() => setFailed(false), 2500)
    return () => clearTimeout(timer)
  }, [failed])

  const onClick = useCallback(async () => {
    const ok = await copyText(value)
    if (ok) {
      setCopied(true)
      setFailed(false)
    } else {
      setFailed(true)
      setCopied(false)
    }
  }, [value])

  const tone = copied
    ? "btn-primary"
    : failed
      ? "btn-danger"
      : ""

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-live="polite"
      className={`btn btn-sm ${tone} ${className}`.trim()}
    >
      {copied ? "✓ Tersalin!" : failed ? "Gagal menyalin" : label}
    </button>
  )
}
