"use client"

import { useCallback, useEffect, useRef } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// MODAL — dialog generik: Esc tutup, klik backdrop tutup, fokus terkurung di
// dalam dialog. Dipakai CreateChoiceModal, ConfirmDialog, ImageLibrary, dll.
// ═══════════════════════════════════════════════════════════════════════════
// Aksesibilitas:
//   • fokus dipindah ke dialog saat dibuka (elemen pertama yang bisa fokus,
//     atau dialog itu sendiri),
//   • Tab/Shift+Tab berputar di dalam dialog (focus trap),
//   • fokus dikembalikan ke elemen pemicu saat dialog ditutup.
// ═══════════════════════════════════════════════════════════════════════════

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, children, maxWidth }) {
  const dialogRef = useRef(null)
  // Elemen yang punya fokus sebelum modal dibuka — dipulihkan saat ditutup.
  const restoreRef = useRef(null)

  const focusables = useCallback(() => {
    const root = dialogRef.current
    if (!root) return []
    return Array.from(root.querySelectorAll(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement
    )
  }, [])

  useEffect(() => {
    if (!open) return undefined

    restoreRef.current = document.activeElement

    // Fokus awal: elemen pertama di dalam dialog, atau dialog itu sendiri.
    const timer = setTimeout(() => {
      const list = focusables()
      if (list.length > 0) list[0].focus()
      else dialogRef.current?.focus()
    }, 0)

    const onKey = (event) => {
      if (event.key === "Escape") {
        onClose?.()
        return
      }
      if (event.key !== "Tab") return
      // Focus trap: Tab di elemen terakhir → kembali ke pertama (dan sebaliknya).
      const list = focusables()
      if (list.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("keydown", onKey)
      // Pulihkan fokus ke pemicu, bila masih ada di DOM.
      const target = restoreRef.current
      if (target && typeof target.focus === "function" && document.contains(target)) {
        target.focus()
      }
    }
  }, [open, onClose, focusables])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // Hanya klik backdrop langsung (bukan isi modal) yang menutup.
        if (event.target === event.currentTarget) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={maxWidth ? { maxWidth } : undefined}
      >
        {title ? (
          <div className="modal-head">
            <h2 className="modal-title">{title}</h2>
            <button type="button" className="modal-close" aria-label="Tutup" onClick={onClose}>
              ✕
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}
