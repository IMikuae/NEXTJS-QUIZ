"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { MathText } from "@/components/MathText"
import { Modal } from "@/components/Modal"
import { ImagePicker } from "@/components/ImagePicker"
import { describeSettings, normalizeSettings } from "@/components/QuizSettingsPanel"
import { CATEGORIES } from "@/lib/templates-data"
import { IMPORT_EXAMPLE, parseImportText } from "@/lib/quiz-import"
import { MAX_TAGS, MAX_TAG_LEN, validateDraft } from "@/lib/quiz-validate"
import { OPTION_LETTERS } from "@/lib/quiz-ui"
import { postJson, putJson } from "@/lib/room-client"
import { toast } from "@/lib/toast-store"

/** Mata pelajaran umum — dipakai sebagai saran, bukan batasan. */
const SUBJECT_SUGGESTIONS = [
  "Matematika",
  "Bahasa Indonesia",
  "Bahasa Inggris",
  "IPA",
  "IPS",
  "Sejarah",
  "Geografi",
  "Ekonomi",
  "Fisika",
  "Kimia",
  "Biologi",
  "Informatika",
  "Umum",
]

// ═══════════════════════════════════════════════════════════════════════════
// EDITOR MODALS — pratinjau & modal-modal editor
// ═══════════════════════════════════════════════════════════════════════════
// Diekstrak dari EditorClient.jsx supaya komponen utama hanya mengurus state
// editor. Tiga komponen di sini: PreviewAll, BulkAddModal, SaveTemplateModal.
// ═══════════════════════════════════════════════════════════════════════════

export function PreviewAll({ questions, settings, onBack }) {
  const [plain, setPlain] = useState(false)

  return (
    <div style={{ marginTop: 20 }}>
      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>Pratinjau {questions.length} soal</h2>
          <p className="footer-note" style={{ margin: "6px 0 0", textAlign: "left" }}>
            {describeSettings(settings).text}
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-sm" aria-pressed={plain} onClick={() => setPlain((p) => !p)}>
            {plain ? "Lihat sebagai matematika" : "Lihat sebagai teks biasa"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>
            ◀ Kembali ke editor
          </button>
        </div>
      </div>

      {questions.map((question, index) => (
        <div className="question-block" key={index}>
          <div className="question-head">
            <span className="question-number">{String(index + 1).padStart(2, "0")}</span>
            <span className="pct-big" style={{ fontSize: 12.5 }}>{question.timeSec}s</span>
          </div>

          {question.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="question-image" src={question.image} alt={`Gambar soal ${index + 1}`} />
          ) : null}

          <div className="preview-text">
            {plain ? (
              <span className="mono">{question.text}</span>
            ) : (
              <MathText text={question.text || "(soal kosong)"} />
            )}
          </div>

          <div className="preview-options">
            {question.options.map((option, oIndex) => (
              <div
                key={oIndex}
                className={`option-card${question.correctIndex === oIndex ? " is-preview-correct" : ""}`}
              >
                <span className="option-badge">{OPTION_LETTERS[oIndex]}</span>
                {question.optionImages?.[oIndex] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="option-thumb"
                    src={question.optionImages[oIndex]}
                    alt={`Gambar opsi ${OPTION_LETTERS[oIndex]}`}
                  />
                ) : null}
                <span>{plain ? option : <MathText text={option || "(kosong)"} />}</span>
                {question.correctIndex === oIndex && (
                  <span className="correct-tag">Benar</span>
                )}
              </div>
            ))}
          </div>

          {question.explanation ? (
            <p className="preview-explanation">
              <strong>Penjelasan: </strong>
              {plain ? question.explanation : <MathText text={question.explanation} />}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL TAMBAH MASSAL — tempel teks, lihat jumlah terbaca, lalu tambahkan
// ═══════════════════════════════════════════════════════════════════════════

export function BulkAddModal({ open, remaining, onClose, onConfirm }) {
  const [text, setText] = useState("")
  const { questions, rowErrors } = useMemo(() => parseImportText(text), [text])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset isian saat modal ditutup
    if (!open) setText("")
  }, [open])

  const willAdd = Math.min(questions.length, remaining)

  return (
    <Modal open={open} onClose={onClose} title="Tambah soal massal" maxWidth={720}>
      <p className="card-hint">
        Tempel banyak soal sekaligus. Format satu baris{" "}
        <span className="mono">Pertanyaan | A | B | C | D | K | detik</span>, atau blok dengan
        baris <span className="mono">A.</span>–<span className="mono">D.</span> +{" "}
        <span className="mono">Jawaban: A</span>. Penjelasan diawali{" "}
        <span className="mono">{"//"}</span>, gambar dengan <span className="mono">[img:URL]</span>.
      </p>

      <label className="field">
        <span className="label">Soal yang mau ditambahkan ({remaining} slot tersisa)</span>
        <textarea
          className="textarea"
          style={{ minHeight: 200, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13.5 }}
          value={text}
          placeholder={IMPORT_EXAMPLE}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="counter-row">
        <span className="stat-label">
          {questions.length} soal terbaca · {willAdd} akan ditambahkan
          {rowErrors.length > 0 ? ` · ${rowErrors.length} baris bermasalah` : ""}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setText(IMPORT_EXAMPLE)}>
          Isi contoh
        </button>
      </div>

      {rowErrors.length > 0 && (
        <div className="import-preview" style={{ marginTop: 12 }}>
          {rowErrors.slice(0, 8).map((row, index) => (
            <div className="import-row is-error" key={`${row.line}-${index}`}>
              <span className="mono">B{row.line}</span>
              <span className="import-row-text">
                <strong>{row.error}</strong>
                {row.text ? (
                  <>
                    <br />
                    <span style={{ opacity: 0.8 }}>{row.text}…</span>
                  </>
                ) : null}
              </span>
            </div>
          ))}
          {rowErrors.length > 8 && (
            <p className="footer-note" style={{ textAlign: "left" }}>
              …dan {rowErrors.length - 8} baris bermasalah lainnya.
            </p>
          )}
        </div>
      )}

      <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button type="button" className="btn" onClick={onClose}>Batal</button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={willAdd === 0}
          onClick={() => onConfirm(text)}
        >
          Tambahkan {willAdd > 0 ? `${willAdd} soal` : ""}
        </button>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL SIMPAN SEBAGAI TEMPLATE — butuh login (CONTRACT §5)
// ═══════════════════════════════════════════════════════════════════════════

export function SaveTemplateModal({ open, quiz, user, settings, onClose, onSaved }) {
  const [title, setTitle] = useState(quiz?.title ?? "")
  const [description, setDescription] = useState(quiz?.description ?? "")
  const [category, setCategory] = useState(quiz?.category ?? "umum")
  const [subject, setSubject] = useState("")
  const [tags, setTags] = useState([])
  const [tagDraft, setTagDraft] = useState("")
  const [coverImage, setCoverImage] = useState(null)
  const [visibility, setVisibility] = useState("private")
  const [gradeLevel, setGradeLevel] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  // Sinkron ulang setiap kali modal dibuka supaya perubahan judul di editor ikut.
  useEffect(() => {
    if (!open || !quiz) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- isi ulang form dari draft saat modal dibuka
    setTitle(quiz.title ?? "")
    setDescription(quiz.description ?? "")
    setCategory(quiz.category ?? "umum")
    setSubject(quiz.subject ?? "")
    setTags(Array.isArray(quiz.tags) ? quiz.tags : [])
    setTagDraft("")
    setCoverImage(quiz.coverImage ?? null)
    setVisibility(quiz.visibility ?? "private")
    setGradeLevel(quiz.gradeLevel ?? user?.kelas ?? "")
    setError("")
  }, [open, quiz, user?.kelas])

  const existingId = quiz?.templateId ?? null
  const isUpdate = Boolean(existingId)

  const addTag = () => {
    const clean = tagDraft.trim().slice(0, MAX_TAG_LEN)
    setTagDraft("")
    if (!clean) return
    setTags((prev) => {
      if (prev.length >= MAX_TAGS) return prev
      if (prev.some((tag) => tag.toLowerCase() === clean.toLowerCase())) return prev
      return [...prev, clean]
    })
  }

  const removeTag = (tag) => setTags((prev) => prev.filter((item) => item !== tag))

  const onSave = async () => {
    if (busy) return
    setError("")

    if (title.trim().length === 0) {
      setError("Judul template tidak boleh kosong.")
      return
    }

    const { ok, problems } = validateDraft(quiz)
    if (!ok) {
      setError(problems[0])
      return
    }

    setBusy(true)
    const payload = {
      title: title.trim().slice(0, 80),
      description: description.trim().slice(0, 300),
      category,
      subject: subject.trim() || null,
      gradeLevel: gradeLevel.trim() || null,
      tags,
      coverImage: coverImage || null,
      visibility,
      settings: normalizeSettings(settings),
      questions: quiz.questions.map((question) => ({
        text: question.text.trim(),
        options: question.options.map((option) => option.trim()),
        correctIndex: question.correctIndex,
        timeSec: question.timeSec,
        image: question.image ?? null,
        optionImages: question.optionImages ?? [null, null, null, null],
        explanation: question.explanation ?? null,
      })),
    }

    const result = isUpdate
      ? await putJson(`/api/templates/${existingId}`, payload)
      : await postJson("/api/templates", payload)

    setBusy(false)

    if (!result.ok) {
      setError(result.error || "Template gagal disimpan.")
      return
    }

    const templateId = result.data?.template?.id ?? existingId
    if (templateId !== undefined && templateId !== null) onSaved(templateId)
    toast.success(isUpdate ? "Template diperbarui" : "Template tersimpan", title.trim())
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Simpan sebagai Template" maxWidth={560}>
      {!user ? (
        <>
          <div className="alert alert-info" style={{ marginTop: 0 }}>
            Template disimpan di server, jadi kamu perlu masuk dulu. Draft di editor
            ini tetap aman di browser — masuk, lalu buka modal ini lagi.
          </div>
          <p className="card-hint">
            Setelah masuk, kamu bisa menyimpan kuis ini sebagai template pribadi
            (hanya kamu yang melihatnya) atau publik (muncul di Template Library).
          </p>
          <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
            <button type="button" className="btn" onClick={onClose}>Nanti saja</button>
            <Link href="/masuk" className="btn btn-primary">Masuk / Daftar</Link>
          </div>
        </>
      ) : (
        <>
          <p className="card-hint">
            Tersimpan sebagai <strong>{user.name}</strong>
            {user.kelas ? ` · Kelas ${user.kelas}` : ""}.
          </p>

          {error && <div className="alert alert-error" role="alert">{error}</div>}

          <label className="field">
            <span className="label">Judul template</span>
            <input
              type="text"
              className="input"
              value={title}
              maxLength={80}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="label">Deskripsi</span>
            <textarea
              className="textarea"
              style={{ minHeight: 60 }}
              value={description}
              maxLength={300}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="label">Kategori</span>
            <select
              className="select"
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value)}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="label">Mata pelajaran (opsional)</span>
            <input
              type="text"
              className="input"
              list="subject-suggestions"
              value={subject}
              maxLength={60}
              disabled={busy}
              placeholder="Mis. Matematika"
              onChange={(event) => setSubject(event.target.value)}
            />
            <datalist id="subject-suggestions">
              {SUBJECT_SUGGESTIONS.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>

          <div className="field">
            <span className="label">Tag (opsional, maks {MAX_TAGS})</span>
            <div className="tag-input-row">
              <input
                type="text"
                className="input"
                value={tagDraft}
                maxLength={MAX_TAG_LEN}
                disabled={busy || tags.length >= MAX_TAGS}
                placeholder="Tambah tag lalu Enter"
                onChange={(event) => setTagDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault()
                    addTag()
                  } else if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
                    removeTag(tags[tags.length - 1])
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy || !tagDraft.trim() || tags.length >= MAX_TAGS}
                onClick={addTag}
              >
                Tambah
              </button>
            </div>
            {tags.length > 0 && (
              <div className="tag-list">
                {tags.map((tag) => (
                  <span className="tag-chip" key={tag}>
                    {tag}
                    <button
                      type="button"
                      className="tag-chip-remove"
                      aria-label={`Hapus tag ${tag}`}
                      disabled={busy}
                      onClick={() => removeTag(tag)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="field">
            <span className="label">Gambar sampul (opsional)</span>
            <ImagePicker
              value={coverImage}
              onChange={setCoverImage}
              label="Gambar sampul"
              compact
            />
          </div>

          <label className="field">
            <span className="label">Tingkat / kelas (opsional)</span>
            <input
              type="text"
              className="input"
              value={gradeLevel}
              maxLength={20}
              disabled={busy}
              placeholder="Mis. 8A"
              onChange={(event) => setGradeLevel(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="label">Visibilitas</span>
            <select
              className="select"
              value={visibility}
              disabled={busy}
              onChange={(event) => setVisibility(event.target.value)}
            >
              <option value="private">Privat — hanya aku</option>
              <option value="public">Publik — muncul di Template Library</option>
            </select>
          </label>

          <div className="alert alert-info" style={{ marginBottom: 0 }}>
            {quiz.questions.length} soal · {describeSettings(settings).text}
            {isUpdate ? " · menyimpan ulang template yang sudah dibuat" : ""}
          </div>

          <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
            <button type="button" className="btn" disabled={busy} onClick={onClose}>Batal</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
              {busy && <span className="spinner" aria-hidden />}
              {isUpdate ? "Perbarui template" : "Simpan template"}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
