"use client"

import { Modal } from "@/components/Modal"

// ═══════════════════════════════════════════════════════════════════════════
// CONFIRM DIALOG — konfirmasi aksi destruktif (hapus quiz/soal).
// ═══════════════════════════════════════════════════════════════════════════

export function ConfirmDialog({ open, title, message, confirmLabel = "Hapus", danger = true, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth={420}>
      <p className="card-hint" style={{ marginBottom: 20 }}>{message}</p>
      <div className="btn-row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn" onClick={onCancel}>
          Batal
        </button>
        <button
          type="button"
          className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
