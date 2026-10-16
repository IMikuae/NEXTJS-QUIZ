"use client"

import { useEffect, useSyncExternalStore } from "react"
import { dismissToast, getToastSnapshot, subscribeToasts } from "@/lib/toast-store"

const TOAST_ICON = {
  success: "✓",
  info: "ℹ",
  warning: "⚠",
  error: "✕",
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST HOST — dirender satu kali di layout; menampilkan semua toast aktif.
// Auto-dismiss per toast sesuai durationMs-nya. aria-live agar screen reader
// ikut tahu ada notifikasi baru.
// ═══════════════════════════════════════════════════════════════════════════

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToastSnapshot, getToastSnapshot)

  // Auto-dismiss: satu effect memantau toast yang paling cepat kedaluwarsa.
  useEffect(() => {
    if (toasts.length === 0) return undefined
    const now = Date.now()
    const timers = toasts.map((t) => {
      const remaining = Math.max(0, t.createdAt + t.durationMs - now)
      return setTimeout(() => dismissToast(t.id), remaining)
    })
    return () => timers.forEach(clearTimeout)
  }, [toasts])

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div className={`toast toast-${t.type}`} key={t.id}>
          <span aria-hidden>{TOAST_ICON[t.type] || "ℹ"}</span>
          <span className="toast-body">
            <span className="toast-title">{t.title}</span>
            {t.message ? <span className="toast-msg">{t.message}</span> : null}
          </span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Tutup notifikasi"
            onClick={() => dismissToast(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
