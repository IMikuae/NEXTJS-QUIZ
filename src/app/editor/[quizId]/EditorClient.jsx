"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { ImagePicker, MathPreview } from "@/components/ImagePicker"
import { ImageLibrary } from "@/components/ImageLibrary"
import { BulkAddModal, PreviewAll, SaveTemplateModal } from "./EditorModals"
import { MathPalette } from "@/components/MathPalette"
import { MathText } from "@/components/MathText"
import { QuizSettingsPanel, describeSettings, normalizeSettings } from "@/components/QuizSettingsPanel"
import { Modal } from "@/components/Modal"
import { useAuth } from "@/lib/auth-store"
import { getQuiz, updateQuiz } from "@/lib/quiz-storage"
import { CATEGORIES } from "@/lib/templates-data"
import {
  DEFAULT_TIME_SEC,
  MAX_QUESTIONS,
  MAX_OPTION_LEN,
  MAX_QUESTION_TEXT_LEN,
  MIN_TIME_SEC,
  MAX_TIME_SEC,
  OPTION_COUNT,
  validateDraft,
} from "@/lib/quiz-validate"
import { IMPORT_EXAMPLE, parseImportText } from "@/lib/quiz-import"
import { postJson, putJson, saveHost } from "@/lib/room-client"
import { OPTION_LETTERS } from "@/lib/quiz-ui"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ EDITOR — 3 pane:
//   kiri   : daftar soal (pilih, drag&drop reorder desktop, ⋮ menu, tambah
//            massal dari tempelan teks, acak urutan soal)
//   tengah : editor soal (teks + gambar soal + 4 opsi dengan gambar masing-masing
//            + penjelasan + palet simbol + pratinjau Matematika)
//   kanan  : pengaturan kuis (judul, deskripsi, kategori, status) + PANEL
//            PENGATURAN KUIS (§1 kontrak) + Simpan sbg Template + Mainkan
// AUTOSAVE: perubahan draft di-debounce 600 ms → updateQuiz (localStorage).
// Simpan-ke-template adalah aksi TERPISAH (butuh login, memanggil API).
// ═══════════════════════════════════════════════════════════════════════════

const TIME_PRESETS = [10, 20, 30, 60, 90]
const AUTOSAVE_DELAY_MS = 600
const MAX_EXPLANATION_LEN = 500

function blankQuestion() {
  return {
    text: "",
    options: ["", "", "", ""],
    correctIndex: 0,
    timeSec: DEFAULT_TIME_SEC,
    image: null,
    optionImages: [null, null, null, null],
    explanation: null,
  }
}

/** Draft dari mana pun → bentuk soal lengkap (field lama tetap dihormati). */
function normalizeQuestion(raw) {
  const base = blankQuestion()
  if (!raw || typeof raw !== "object") return base

  const images = Array.isArray(raw.optionImages) ? raw.optionImages : []
  return {
    text: typeof raw.text === "string" ? raw.text : "",
    options: Array.from({ length: OPTION_COUNT }, (_, index) =>
      typeof raw.options?.[index] === "string" ? raw.options[index] : ""
    ),
    correctIndex:
      Number.isInteger(raw.correctIndex) && raw.correctIndex >= 0 && raw.correctIndex < OPTION_COUNT
        ? raw.correctIndex
        : 0,
    timeSec: Number.isInteger(raw.timeSec) ? raw.timeSec : DEFAULT_TIME_SEC,
    image: typeof raw.image === "string" && raw.image.length > 0 ? raw.image : null,
    optionImages: Array.from({ length: OPTION_COUNT }, (_, index) =>
      typeof images[index] === "string" && images[index].length > 0 ? images[index] : null
    ),
    explanation:
      typeof raw.explanation === "string" && raw.explanation.trim().length > 0
        ? raw.explanation.slice(0, MAX_EXPLANATION_LEN)
        : null,
  }
}

/** Kocok daftar tanpa mengubah daftar aslinya (Fisher–Yates). */
function shuffle(list) {
  const rows = [...list]
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rows[i], rows[j]] = [rows[j], rows[i]]
  }
  return rows
}

export default function EditorClient({ quizId }) {
  const router = useRouter()
  const { user, loaded: authLoaded } = useAuth()

  // Draft dimuat dari localStorage HANYA di effect (aman hydration) dan setelah
  // akun selesai dibaca (data dipisah per pemilik).
  const [quiz, setQuiz] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [menuOpenIndex, setMenuOpenIndex] = useState(null)
  const [deleteIndex, setDeleteIndex] = useState(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [previewAll, setPreviewAll] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)

  // ── Autosave state ──
  const [saveState, setSaveState] = useState("idle") // idle | saving | saved | error
  const saveTimerRef = useRef(null)

  // ── Kolom yang menerima sisipan palet simbol ──
  const [activeField, setActiveField] = useState(null)
  const fieldRef = useRef(null)

  // ── Muat draft ──
  useEffect(() => {
    if (!authLoaded) return
    const loaded = getQuiz(quizId)
    if (!loaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- baca draft dari localStorage (external)
      setNotFound(true)
      return
    }
    const questions = Array.isArray(loaded.questions) ? loaded.questions : []
    setQuiz({
      ...loaded,
      settings: normalizeSettings(loaded.settings),
      questions: questions.length > 0 ? questions.map(normalizeQuestion) : [blankQuestion()],
    })
  }, [quizId, authLoaded, user?.id])

  // ── Autosave: setiap perubahan quiz → debounce → updateQuiz ──
  useEffect(() => {
    if (!quiz) return undefined
    // eslint-disable-next-line react-hooks/set-state-in-effect -- status autosave mengikuti perubahan draft
    setSaveState("saving")
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const result = updateQuiz(quiz.id, {
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        subject: quiz.subject ?? null,
        gradeLevel: quiz.gradeLevel ?? null,
        tags: Array.isArray(quiz.tags) ? quiz.tags : [],
        coverImage: quiz.coverImage ?? null,
        visibility: quiz.visibility ?? "private",
        status: quiz.status,
        settings: quiz.settings,
        questions: quiz.questions,
        templateId: quiz.templateId ?? null,
      })
      if (result.ok) {
        setSaveState("saved")
      } else {
        setSaveState("error")
        if (result.error === "quota") {
          toast.error("Gagal menyimpan", "Penyimpanan browser penuh.")
        }
      }
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(saveTimerRef.current)
  }, [quiz])

  // Palet simbol memegang elemen DOM; begitu soal berganti, elemen itu dilepas.
  useEffect(() => {
    fieldRef.current = null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset target palet saat soal berganti
    setActiveField(null)
  }, [activeIndex])

  // ── Mutasi draft ──
  const patchQuiz = useCallback((patch) => {
    setQuiz((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const patchQuestion = useCallback((index, patch) => {
    setQuiz((prev) => {
      if (!prev) return prev
      const questions = prev.questions.map((question, i) =>
        i === index ? { ...question, ...patch } : question
      )
      return { ...prev, questions }
    })
  }, [])

  const patchSettings = useCallback((patch) => {
    setQuiz((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev))
  }, [])

  const addQuestion = useCallback(() => {
    setQuiz((prev) => {
      if (!prev) return prev
      if (prev.questions.length >= MAX_QUESTIONS) {
        toast.warning("Batas soal tercapai", `Maksimal ${MAX_QUESTIONS} soal.`)
        return prev
      }
      const questions = [...prev.questions, blankQuestion()]
      setActiveIndex(questions.length - 1)
      return { ...prev, questions }
    })
  }, [])

  const duplicateQuestion = useCallback((index) => {
    setQuiz((prev) => {
      if (!prev || prev.questions.length >= MAX_QUESTIONS) {
        toast.warning("Batas soal tercapai", `Maksimal ${MAX_QUESTIONS} soal.`)
        return prev
      }
      const questions = [...prev.questions]
      questions.splice(index + 1, 0, structuredClone(questions[index]))
      return { ...prev, questions }
    })
    setActiveIndex((prev) => (prev > index ? prev + 1 : prev))
    setMenuOpenIndex(null)
  }, [])

  const removeQuestion = useCallback((index) => {
    setQuiz((prev) => {
      if (!prev) return prev
      if (prev.questions.length <= 1) {
        toast.warning("Minimal 1 soal", "Kuis harus punya setidaknya satu soal.")
        return prev
      }
      return { ...prev, questions: prev.questions.filter((_, i) => i !== index) }
    })
    setActiveIndex(0)
    setDeleteIndex(null)
    setMenuOpenIndex(null)
  }, [])

  const moveQuestion = useCallback((index, direction) => {
    setQuiz((prev) => {
      if (!prev) return prev
      const target = index + direction
      if (target < 0 || target >= prev.questions.length) return prev
      const questions = [...prev.questions]
      ;[questions[index], questions[target]] = [questions[target], questions[index]]
      return { ...prev, questions }
    })
    setActiveIndex((prev) => prev + direction)
    setMenuOpenIndex(null)
  }, [])

  const reorderQuestion = useCallback((from, to) => {
    setQuiz((prev) => {
      if (!prev) return prev
      if (from === to || from < 0 || to < 0 || from >= prev.questions.length || to >= prev.questions.length) {
        return prev
      }
      const questions = [...prev.questions]
      const [moved] = questions.splice(from, 1)
      questions.splice(to, 0, moved)
      return { ...prev, questions }
    })
    setActiveIndex(to)
    setDragIndex(null)
  }, [])

  /** Acak urutan soal di editor (server juga bisa mengacak saat kuis dimulai). */
  const shuffleQuestions = useCallback(() => {
    setQuiz((prev) => {
      if (!prev || prev.questions.length < 2) return prev
      return { ...prev, questions: shuffle(prev.questions) }
    })
    setActiveIndex(0)
    setMenuOpenIndex(null)
    toast.info("Urutan soal diacak", "Simpan otomatis berjalan seperti biasa.")
  }, [])

  /** Tambah soal massal dari tempelan teks (pakai parser impor yang sama). */
  const addBulkQuestions = useCallback(
    (text) => {
      const { questions } = parseImportText(text)
      if (questions.length === 0) {
        toast.warning("Tidak ada soal terbaca", "Periksa kembali formatnya.")
        return { ok: false, added: 0 }
      }

      let added = 0
      setQuiz((prev) => {
        if (!prev) return prev
        const room = Math.max(0, MAX_QUESTIONS - prev.questions.length)
        const incoming = questions.slice(0, room).map(normalizeQuestion)
        added = incoming.length
        if (added === 0) return prev
        return { ...prev, questions: [...prev.questions, ...incoming] }
      })

      if (added < questions.length) {
        toast.warning(
          "Sebagian soal tidak masuk",
          `Batas ${MAX_QUESTIONS} soal tercapai — ${questions.length - added} soal dilewati.`
        )
      }
      if (added > 0) {
        toast.success(`${added} soal ditambahkan`)
        setBulkOpen(false)
      }
      return { ok: added > 0, added }
    },
    []
  )

  // ── Sisipan palet simbol ke kolom yang sedang aktif ──
  const onPaletteChange = useCallback(
    (element, next) => {
      const field = element?.dataset?.mathField
      if (!field) return

      if (field === "text") {
        patchQuestion(activeIndex, { text: next.slice(0, MAX_QUESTION_TEXT_LEN) })
        return
      }
      if (field === "explanation") {
        patchQuestion(activeIndex, { explanation: next.slice(0, MAX_EXPLANATION_LEN) })
        return
      }
      if (field.startsWith("option-")) {
        const optionIndex = Number.parseInt(field.slice(7), 10)
        setQuiz((prev) => {
          if (!prev) return prev
          const questions = prev.questions.map((question, i) => {
            if (i !== activeIndex) return question
            const options = [...question.options]
            options[optionIndex] = next.slice(0, MAX_OPTION_LEN)
            return { ...question, options }
          })
          return { ...prev, questions }
        })
      }
    },
    [activeIndex, patchQuestion]
  )

  const onFieldFocus = useCallback((event) => {
    fieldRef.current = event.currentTarget
    setActiveField(event.currentTarget)
  }, [])

  // ── Mainkan: validasi → buat room (dengan settings) → /host/{code} ──
  const [playing, setPlaying] = useState(false)
  const onPlay = useCallback(async () => {
    if (!quiz || playing) return
    const { ok, problems } = validateDraft(quiz)
    if (!ok) {
      toast.error("Kuis belum siap dimainkan", problems[0])
      return
    }

    setPlaying(true)
    const result = await postJson("/api/rooms", {
      title: quiz.title.trim() || "Kuis Yue Quiz",
      settings: quiz.settings,
      questions: quiz.questions.map((question) => ({
        text: question.text.trim(),
        options: question.options.map((option) => option.trim()),
        correctIndex: question.correctIndex,
        timeSec: question.timeSec,
        image: question.image ?? null,
        optionImages: question.optionImages ?? [null, null, null, null],
        explanation: question.explanation ?? null,
      })),
    })
    setPlaying(false)

    if (!result.ok) {
      toast.error("Gagal membuat room", result.error || "Coba lagi.")
      return
    }
    const { code, hostToken } = result.data || {}
    if (!code || !hostToken) {
      toast.error("Server tidak mengirim kode room", "Coba lagi.")
      return
    }
    saveHost(code, hostToken)
    router.push(`/host/${code}`)
  }, [quiz, playing, router])

  // ── Drag & drop (desktop) ──
  const onDropOn = useCallback(
    (targetIndex) => {
      if (dragIndex === null || dragIndex === targetIndex) return
      reorderQuestion(dragIndex, targetIndex)
    },
    [dragIndex, reorderQuestion]
  )

  // ── Tutup ⋮ menu saat klik di luar ──
  useEffect(() => {
    if (menuOpenIndex === null) return undefined
    const close = () => setMenuOpenIndex(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [menuOpenIndex])

  const activeQuestion = quiz?.questions?.[activeIndex] ?? null
  const totalEstimateMin = useMemo(() => {
    if (!quiz) return 0
    const totalSec = quiz.questions.reduce((sum, q) => sum + (q.timeSec || DEFAULT_TIME_SEC), 0)
    return Math.max(1, Math.round(totalSec / 60))
  }, [quiz])

  // ═══ Render: not found ═══
  if (notFound) {
    return (
      <main className="page page-narrow">
        <div className="card center" style={{ marginTop: 48 }}>
          <p style={{ fontSize: 40, margin: 0 }} aria-hidden>🫥</p>
          <h1 className="card-title" style={{ marginTop: 14 }}>Draft tidak ditemukan</h1>
          <p className="card-hint">
            Draft mungkin sudah dihapus dari browser ini. Mulai dari halaman utama.
          </p>
          <Link href="/" className="btn btn-primary">Ke halaman utama</Link>
        </div>
      </main>
    )
  }

  // ═══ Render: loading ═══
  if (!quiz) {
    return (
      <main className="page page-narrow">
        <div className="waiting" style={{ marginTop: 60 }}>
          <span className="spinner" aria-hidden /> Memuat editor…
        </div>
      </main>
    )
  }

  const saveLabel =
    saveState === "saving" ? "⟳ Menyimpan…"
    : saveState === "saved" ? "✓ Tersimpan otomatis"
    : saveState === "error" ? "✕ Gagal menyimpan"
    : ""

  const settingsText = describeSettings(quiz.settings).text
  const mathCount = quiz.questions.filter((question) => /[\/√∛^_|]|<=|>=|!=|\+-/.test(question.text)).length

  return (
    <main className="page" style={{ maxWidth: 1320 }}>
      {/* ── Header editor ── */}
      <div
        className="counter-row"
        style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Link href="/my-quizzes" className="link" style={{ fontSize: 14 }}>← Kembali</Link>
          <span className={`save-indicator${saveState === "saving" ? " is-saving" : ""}${saveState === "error" ? " is-error" : ""}`}>
            {saveLabel}
          </span>
        </div>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={previewAll}
            onClick={() => setPreviewAll((prev) => !prev)}
          >
            {previewAll ? "◀ Kembali ke editor" : "👁 Pratinjau semua"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTemplateOpen(true)}
          >
            🏷 Simpan sbg Template
          </button>
          <button type="button" className="btn btn-sm btn-primary" disabled={playing} onClick={onPlay}>
            {playing && <span className="spinner" aria-hidden />}
            ▶ Mainkan
          </button>
        </div>
      </div>

      {previewAll ? (
        <PreviewAll questions={quiz.questions} settings={quiz.settings} onBack={() => setPreviewAll(false)} />
      ) : (
        <div className="editor-shell">
          {/* ═══ PANE 1: daftar soal ═══ */}
          <div className="editor-pane">
            <h3 className="filter-group-title">Soal ({quiz.questions.length})</h3>
            <div className="qlist">
              {quiz.questions.map((question, index) => (
                <div
                  key={index}
                  className={`qlist-item${index === activeIndex ? " is-active" : ""}${dragIndex === index ? " is-dragging" : ""}`}
                  onClick={() => setActiveIndex(index)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setActiveIndex(index)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => onDropOn(index)}
                >
                  <span
                    className="drag-handle"
                    title="Tarik untuk mengurutkan"
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragEnd={() => setDragIndex(null)}
                    onClick={(event) => event.stopPropagation()}
                  >
                    ⋮⋮
                  </span>
                  <span className="qlist-text">
                    <strong style={{ color: "inherit" }}>{index + 1}.</strong>{" "}
                    {question.text.trim() || "(soal kosong)"}
                    {question.image && <span className="qlist-mark" title="Ada gambar soal"> 🖼</span>}
                    {question.explanation && <span className="qlist-mark" title="Ada penjelasan"> 💬</span>}
                  </span>
                  <span className="menu-anchor" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      aria-label={`Aksi untuk soal ${index + 1}`}
                      aria-expanded={menuOpenIndex === index}
                      onClick={() => setMenuOpenIndex(menuOpenIndex === index ? null : index)}
                    >
                      ⋮
                    </button>
                    {menuOpenIndex === index && (
                      <div className="menu-pop" onClick={(event) => event.stopPropagation()}>
                        <button type="button" className="menu-item" onClick={() => duplicateQuestion(index)}>
                          Duplikat
                        </button>
                        <button
                          type="button"
                          className="menu-item"
                          disabled={index === 0}
                          onClick={() => moveQuestion(index, -1)}
                        >
                          Naikkan
                        </button>
                        <button
                          type="button"
                          className="menu-item"
                          disabled={index === quiz.questions.length - 1}
                          onClick={() => moveQuestion(index, 1)}
                        >
                          Turunkan
                        </button>
                        <button
                          type="button"
                          className="menu-item is-danger"
                          onClick={() => setDeleteIndex(index)}
                        >
                          Hapus
                        </button>
                      </div>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 12 }}
              disabled={quiz.questions.length >= MAX_QUESTIONS}
              onClick={addQuestion}
            >
              ＋ Tambah Soal
            </button>

            <div className="btn-row" style={{ marginTop: 9 }}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={quiz.questions.length >= MAX_QUESTIONS}
                onClick={() => setBulkOpen(true)}
              >
                ✚ Massal
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={quiz.questions.length < 2}
                onClick={shuffleQuestions}
              >
                🔀 Acak urutan
              </button>
            </div>

            <div className="alert alert-info" style={{ marginTop: 14, marginBottom: 0 }}>
              <strong>Estimasi: {totalEstimateMin} menit</strong> untuk {quiz.questions.length} soal.
              {mathCount > 0 ? ` ${mathCount} soal memakai notasi matematika.` : ""}
            </div>
          </div>

          {/* ═══ PANE 2: editor soal aktif ═══ */}
          {activeQuestion && (
            <div className="editor-pane">
              <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                <span className="question-number">Soal {activeIndex + 1} dari {quiz.questions.length}</span>
                <span className="question-number">
                  {activeQuestion.text.length} / {MAX_QUESTION_TEXT_LEN}
                </span>
              </div>

              <ImagePicker
                label="Gambar soal"
                value={activeQuestion.image}
                onChange={(image) => patchQuestion(activeIndex, { image })}
              />

              <label className="field">
                <span className="label">Pertanyaan</span>
                <textarea
                  className="textarea"
                  value={activeQuestion.text}
                  maxLength={MAX_QUESTION_TEXT_LEN}
                  data-math-field="text"
                  onFocus={onFieldFocus}
                  placeholder="Tulis pertanyaannya di sini… (3/4, sqrt(3), x^2, |x|)"
                  onChange={(event) => patchQuestion(activeIndex, { text: event.target.value })}
                />
              </label>

              <MathPalette
                targetRef={fieldRef}
                targetKey={activeField}
                onValueChange={onPaletteChange}
                hint="klik kolom teks soal dulu"
              />

              <p className="radio-hint">
                Isi 4 opsi, lalu <strong>klik baris opsi</strong> untuk menandai jawaban benar.
                Gambar per opsi bersifat opsional.
              </p>

              {activeQuestion.options.map((option, oIndex) => {
                const isCorrect = activeQuestion.correctIndex === oIndex
                return (
                  <div
                    key={oIndex}
                    className={`opt-row is-stacked${isCorrect ? " is-correct-edit" : ""}`}
                  >
                    <div className="opt-row-main">
                      <span
                        className="option-badge opt-badge-btn"
                        role="button"
                        tabIndex={0}
                        aria-pressed={isCorrect}
                        title={isCorrect ? "Jawaban benar" : "Tandai sebagai jawaban benar"}
                        onClick={() => patchQuestion(activeIndex, { correctIndex: oIndex })}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            patchQuestion(activeIndex, { correctIndex: oIndex })
                          }
                        }}
                      >
                        {OPTION_LETTERS[oIndex]}
                      </span>
                      <input
                        type="text"
                        value={option}
                        maxLength={MAX_OPTION_LEN}
                        data-math-field={`option-${oIndex}`}
                        onFocus={onFieldFocus}
                        placeholder={`Opsi ${OPTION_LETTERS[oIndex]}`}
                        aria-label={`Opsi ${OPTION_LETTERS[oIndex]} soal ${activeIndex + 1}`}
                        onChange={(event) => {
                          const options = [...activeQuestion.options]
                          options[oIndex] = event.target.value
                          patchQuestion(activeIndex, { options })
                        }}
                      />
                      {isCorrect && (
                        <button
                          type="button"
                          className="opt-check"
                          title="Jawaban benar — klik untuk membatalkan"
                          onClick={() => patchQuestion(activeIndex, { correctIndex: -1 })}
                        >
                          ✓
                        </button>
                      )}
                    </div>

                    <ImagePicker
                      compact
                      label={`Gambar opsi ${OPTION_LETTERS[oIndex]}`}
                      value={activeQuestion.optionImages?.[oIndex] ?? null}
                      onChange={(url) => {
                        const optionImages = [...(activeQuestion.optionImages ?? [null, null, null, null])]
                        optionImages[oIndex] = url
                        patchQuestion(activeIndex, { optionImages })
                      }}
                    />
                  </div>
                )
              })}

              <div className="field" style={{ marginTop: 16 }}>
                <span className="label">Penjelasan jawaban (opsional)</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 64 }}
                  value={activeQuestion.explanation ?? ""}
                  maxLength={MAX_EXPLANATION_LEN}
                  data-math-field="explanation"
                  onFocus={onFieldFocus}
                  placeholder="Kenapa jawabannya itu? Muncul setelah pemain menjawab bila “Tampilkan penjelasan” menyala."
                  onChange={(event) =>
                    patchQuestion(activeIndex, { explanation: event.target.value })
                  }
                />
                <span className="field-hint">
                  {(activeQuestion.explanation ?? "").length} / {MAX_EXPLANATION_LEN}
                </span>
              </div>

              <div className="field" style={{ marginTop: 16 }}>
                <span className="label">Waktu menjawab</span>
                <div className="time-chips">
                  {TIME_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`time-chip${activeQuestion.timeSec === preset ? " is-active" : ""}`}
                      onClick={() => patchQuestion(activeIndex, { timeSec: preset })}
                    >
                      {preset}s
                    </button>
                  ))}
                  <label
                    className={`time-chip${!TIME_PRESETS.includes(activeQuestion.timeSec) ? " is-active" : ""}`}
                    title={`Custom (${MIN_TIME_SEC}–${MAX_TIME_SEC} detik)`}
                  >
                    <input
                      type="number"
                      min={MIN_TIME_SEC}
                      max={MAX_TIME_SEC}
                      value={activeQuestion.timeSec}
                      onChange={(event) => {
                        const value = Number.parseInt(event.target.value, 10)
                        if (Number.isInteger(value)) {
                          patchQuestion(activeIndex, {
                            timeSec: Math.min(MAX_TIME_SEC, Math.max(MIN_TIME_SEC, value)),
                          })
                        }
                      }}
                      aria-label="Durasi custom dalam detik"
                    />
                    s
                  </label>
                </div>
              </div>

              {/* ── Pratinjau langsung soal ini ── */}
              <div className="question-preview">
                <MathPreview text={activeQuestion.text} label={`Pratinjau soal ${activeIndex + 1}`} />
                <div className="preview-options">
                  {activeQuestion.options.map((option, oIndex) => (
                    <div
                      key={oIndex}
                      className={`option-card${activeQuestion.correctIndex === oIndex ? " is-preview-correct" : ""}`}
                    >
                      <span className="option-badge">{OPTION_LETTERS[oIndex]}</span>
                      {activeQuestion.optionImages?.[oIndex] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          className="option-thumb"
                          src={activeQuestion.optionImages[oIndex]}
                          alt={`Gambar opsi ${OPTION_LETTERS[oIndex]}`}
                        />
                      ) : null}
                      <span>
                        {option.trim() ? <MathText text={option} /> : <em>(opsi kosong)</em>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ═══ PANE 3: pengaturan quiz ═══ */}
          <div className="editor-pane">
            <h3 className="filter-group-title">Pengaturan Quiz</h3>

            <label className="field">
              <span className="label">Judul</span>
              <input
                type="text"
                className="input"
                value={quiz.title}
                maxLength={80}
                placeholder="Judul kuis"
                onChange={(event) => patchQuiz({ title: event.target.value })}
              />
            </label>

            <label className="field">
              <span className="label">Deskripsi</span>
              <textarea
                className="textarea"
                style={{ minHeight: 60 }}
                value={quiz.description}
                maxLength={200}
                placeholder="Deskripsi singkat (opsional)"
                onChange={(event) => patchQuiz({ description: event.target.value })}
              />
            </label>

            <label className="field">
              <span className="label">Kategori</span>
              <select
                className="select"
                value={quiz.category}
                onChange={(event) => patchQuiz({ category: event.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="label">Status</span>
              <select
                className="select"
                value={quiz.status}
                onChange={(event) => patchQuiz({ status: event.target.value })}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>

            <hr className="pane-divider" />

            <h3 className="filter-group-title">Aturan Permainan</h3>
            <QuizSettingsPanel
              settings={quiz.settings}
              questionCount={quiz.questions.length}
              onChange={patchSettings}
            />

            <hr className="pane-divider" />

            <button
              type="button"
              className="btn btn-block"
              aria-expanded={libraryOpen}
              onClick={() => setLibraryOpen((open) => !open)}
            >
              🖼 Kelola Gambar
            </button>

            <ImageLibrary open={libraryOpen} />

            <hr className="pane-divider" />

            <button
              type="button"
              className="btn btn-block"
              onClick={() => setTemplateOpen(true)}
            >
              🏷 Simpan sebagai Template
            </button>

            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 10 }}
              disabled={playing}
              onClick={onPlay}
            >
              {playing && <span className="spinner" aria-hidden />}
              ▶ Mainkan sekarang
            </button>

            <p className="footer-note" style={{ marginTop: 14, textAlign: "left" }}>
              Draft tersimpan otomatis di browser ini. Template & akun tersimpan di
              server: <span className="mono">{settingsText}</span>
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteIndex !== null}
        title={`Hapus soal ${deleteIndex + 1}?`}
        message="Soal yang dihapus tidak bisa dikembalikan. Quiz tetap tersimpan otomatis."
        confirmLabel="Hapus soal"
        onConfirm={() => removeQuestion(deleteIndex)}
        onCancel={() => setDeleteIndex(null)}
      />

      <BulkAddModal
        open={bulkOpen}
        remaining={Math.max(0, MAX_QUESTIONS - quiz.questions.length)}
        onClose={() => setBulkOpen(false)}
        onConfirm={addBulkQuestions}
      />

      <SaveTemplateModal
        open={templateOpen}
        quiz={quiz}
        user={user}
        settings={quiz.settings}
        onClose={() => setTemplateOpen(false)}
        onSaved={(templateId) => patchQuiz({ templateId })}
      />
    </main>
  )
}
