"use client"

import { Modal } from "@/components/Modal"
import { createQuiz } from "@/lib/quiz-storage"
import { toast } from "@/lib/toast-store"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// CREATE CHOICE MODAL — "Apa yang ingin kamu lakukan?" 3 jalur:
//   ✨ Buat dari Nol      → buat draft kosong → /editor/{id}
//   📚 Gunakan Template   → /templates
//   📄 Import Quiz        → /editor/new?mode=import
// Tidak pernah langsung membuat room — draft dulu, baru Play dari editor.
// ═══════════════════════════════════════════════════════════════════════════

export function CreateChoiceModal({ open, onClose }) {
  const router = useRouter()

  const onCreateBlank = useCallback(() => {
    const result = createQuiz({
      title: "Kuis Baru",
      description: "",
      category: "umum",
      questions: [],
    })
    if (!result.ok) {
      toast.error("Gagal membuat kuis", "Penyimpanan browser penuh.")
      return
    }
    onClose?.()
    router.push(`/editor/${result.data.id}`)
  }, [router, onClose])

  return (
    <Modal open={open} onClose={onClose} title="Apa yang ingin kamu lakukan?">
      <div className="choice-grid">
        <button type="button" className="choice-card" onClick={onCreateBlank}>
          <span className="choice-icon" aria-hidden>✨</span>
          <span className="choice-title">Buat dari Nol</span>
          <span className="choice-desc">Buat quiz sendiri dari pertanyaanmu, satu per satu.</span>
        </button>

        <button
          type="button"
          className="choice-card"
          onClick={() => {
            onClose?.()
            router.push("/templates")
          }}
        >
          <span className="choice-icon" aria-hidden>📚</span>
          <span className="choice-title">Gunakan Template</span>
          <span className="choice-desc">Mulai dari quiz siap pakai, lalu edit sesuai kebutuhanmu.</span>
        </button>

        <button
          type="button"
          className="choice-card"
          onClick={() => {
            onClose?.()
            router.push("/editor/new?mode=import")
          }}
        >
          <span className="choice-icon" aria-hidden>📄</span>
          <span className="choice-title">Import Quiz</span>
          <span className="choice-desc">Tempel daftar soal dari teks — cepat untuk kuis massal.</span>
        </button>
      </div>
    </Modal>
  )
}
