"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { EmptyState } from "@/components/EmptyState"
import { MathText } from "@/components/MathText"
import { useAuth } from "@/lib/auth-store"
import { createQuiz } from "@/lib/quiz-storage"
import { MAX_QUESTIONS } from "@/lib/quiz-validate"
import {
  IMPORT_CSV_EXAMPLE,
  IMPORT_EXAMPLE,
  parseImportText,
} from "@/lib/quiz-import"
import { getJson, postJson } from "@/lib/room-client"
import { OPTION_LETTERS } from "@/lib/quiz-ui"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// EDITOR ENTRY — empat jalur masuk (server meneruskan from/mode/template):
//   normal            → draft kosong → /editor/{id}
//   from=<tplId>      → salin template bawaan → draft → /editor/{id}
//   template=<id>     → salin template SERVER (POST …/clone) → draft → editor
//   import            → ImportWizard: tempel teks/CSV, pratinjau, simpan
// Semua efek penyimpanan berjalan di useEffect (localStorage aman SSR).
// ═══════════════════════════════════════════════════════════════════════════

export default function EditorEntryClient({ from, mode, template }) {
  const router = useRouter()
  const { user, loaded: authLoaded } = useAuth()
  const [error, setError] = useState("")

  // Draft dibuat setelah akun selesai dibaca: quiz-storage memisahkan data per
  // pemilik, jadi draft yang dibuat lebih awal bisa masuk namespace "tamu".
  useEffect(() => {
    if (mode === "import" || !authLoaded) return undefined

    if (from) {
      // Template bawaan: data lengkap (dengan kunci jawaban) TIDAK ikut ke
      // bundel klien — ambil lewat API server saat benar-benar dipakai.
      let cancelled = false
      ;(async () => {
        const fetched = await getJson(`/api/templates/builtin/${encodeURIComponent(from)}`)
        if (cancelled) return

        if (!fetched.ok || !fetched.data?.quiz) {
          setError("Template tidak ditemukan. Mulai dari nol atau pilih template lain.")
          return
        }

        const result = createQuiz(fetched.data.quiz)
        if (cancelled) return
        if (!result.ok) {
          setError("Penyimpanan browser penuh. Hapus beberapa kuis lama lalu coba lagi.")
          return
        }
        router.replace(`/editor/${result.data.id}`)
      })()

      return () => {
        cancelled = true
      }
    }

    // Template SERVER: klon dulu (POST), baru buat draft lokal.
    if (template) {
      if (!user) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- baca template & auth (external)
        setError("Template server butuh akun. Masuk dulu, lalu pakai template ini lagi.")
        return undefined
      }

      let cancelled = false
      ;(async () => {
        const cloned = await postJson(`/api/templates/${template}/clone`, {})
        if (cancelled) return

        if (!cloned.ok) {
          setError(cloned.error || "Gagal menyalin template dari server.")
          return
        }

        const payload = cloned.data?.template
        const questions = Array.isArray(payload?.questions) ? payload.questions : []
        const result = createQuiz({
          title: payload?.title || "Kuis dari Template",
          description: payload?.description || "",
          category: payload?.category || "umum",
          sourceTemplateId: null,
          settings: payload?.settings,
          questions,
        })
        if (cancelled) return
        if (!result.ok) {
          setError("Penyimpanan browser penuh. Hapus beberapa kuis lama lalu coba lagi.")
          return
        }
        router.replace(`/editor/${result.data.id}`)
      })()

      return () => {
        cancelled = true
      }
    }

    const result = createQuiz({ title: "Kuis Baru", description: "", category: "umum", questions: [] })
    if (!result.ok) {
      setError("Penyimpanan browser penuh. Hapus beberapa kuis lama lalu coba lagi.")
      return undefined
    }
    router.replace(`/editor/${result.data.id}`)
    return undefined
  }, [from, mode, router, authLoaded, user, template])

  if (error) {
    return (
      <main className="page page-narrow">
        <div className="card center" style={{ marginTop: 40 }}>
          <EmptyState icon="⚠️" title="Gagal menyiapkan draft" description={error}>
            <button type="button" className="btn btn-primary" onClick={() => router.push("/")}>
              Ke halaman utama
            </button>
            {user ? null : (
              <Link href="/masuk" className="btn">Masuk</Link>
            )}
          </EmptyState>
        </div>
      </main>
    )
  }

  if (mode === "import") return <ImportWizard />

  return (
    <main className="page page-narrow">
      <div className="waiting" style={{ marginTop: 60 }}>
        <span className="spinner" aria-hidden /> Menyiapkan draft…
      </div>
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT WIZARD — tempel teks / CSV, pratinjau hasil impor, lalu simpan
// ═══════════════════════════════════════════════════════════════════════════
// Parser lengkapnya ada di src/lib/quiz-import.js (dipakai bersama tombol
// "Tambah massal" di editor). Wizard ini hanya menyajikan hasilnya:
//   • jumlah soal terbaca + berapa yang punya gambar/penjelasan/waktu khusus
//   • daftar baris bermasalah dengan nomor baris asli
//   • pratinjau tiap soal (render Matematika + tombol teks biasa)
// ═══════════════════════════════════════════════════════════════════════════

function ImportWizard() {
  const router = useRouter()
  const [text, setText] = useState("")
  const [saved, setSaved] = useState(false)
  const [plain, setPlain] = useState(false)

  const { questions, rowErrors, stats } = useMemo(() => parseImportText(text), [text])

  const tooMany = questions.length > MAX_QUESTIONS
  const canSave = questions.length > 0 && !tooMany && !saved

  const onSave = useCallback(() => {
    if (questions.length === 0) {
      toast.warning("Belum ada soal valid", "Periksa kembali format teksnya.")
      return
    }
    if (questions.length > MAX_QUESTIONS) {
      toast.error("Terlalu banyak soal", `Maksimal ${MAX_QUESTIONS} soal per kuis.`)
      return
    }

    const titleGuess = questions[0].text.split(/[?.!]/)[0].slice(0, 40) || "Kuis Import"
    const result = createQuiz({
      title: `Import — ${titleGuess}`,
      description: `Diimpor dari teks (${questions.length} soal).`,
      category: "umum",
      questions,
    })
    if (!result.ok) {
      toast.error("Gagal menyimpan", "Penyimpanan browser penuh.")
      return
    }

    setSaved(true)
    toast.success(`${questions.length} soal berhasil diimpor`)
    router.push(`/editor/${result.data.id}`)
  }, [questions, router])

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <h1 className="page-title" style={{ fontSize: "clamp(26px, 5vw, 36px)" }}>
        Import Kuis dari Teks
      </h1>
      <p className="page-subtitle">
        Dua format didukung, boleh dicampur dalam satu tempelan:
        <span className="mono" style={{ display: "block", marginTop: 8, fontSize: 13.5 }}>
          Satu baris: Pertanyaan | A | B | C | D | Jawaban | Detik | // penjelasan | [img:URL]
        </span>
        <span className="mono" style={{ display: "block", marginTop: 4, fontSize: 13.5 }}>
          Blok: baris soal, lalu A. / B. / C. / D., lalu Jawaban: A
        </span>
      </p>

      <div className="card" style={{ marginTop: 22 }}>
        <label className="field">
          <span className="label">Tempel teks soalmu di sini</span>
          <textarea
            className="textarea"
            style={{ minHeight: 200, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", fontSize: 13.5 }}
            value={text}
            placeholder={IMPORT_EXAMPLE}
            onChange={(event) => setText(event.target.value)}
          />
        </label>

        <div className="counter-row" style={{ marginTop: 0 }}>
          <div className="stat">
            <span className="stat-value">{questions.length}</span>
            <span className="stat-label">Soal terbaca</span>
          </div>
          <span className="stat-label">
            {stats.withImage} bergambar · {stats.withExplanation} berpenjelasan ·{" "}
            {stats.withCustomTime} waktu khusus
            {tooMany ? ` · melebihi batas ${MAX_QUESTIONS}` : ""}
          </span>
        </div>

        {rowErrors.length > 0 && (
          <div className="import-preview" style={{ marginTop: 14 }}>
            {rowErrors.map((row, index) => (
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
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={onSave}>
            {saved && <span className="spinner" aria-hidden />}
            Import {questions.length > 0 ? `${questions.length} soal` : ""}
          </button>
          <button type="button" className="btn" onClick={() => setText(IMPORT_EXAMPLE)}>
            Isi contoh teks
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setText(IMPORT_CSV_EXAMPLE)}>
            Isi contoh CSV
          </button>
          <button type="button" className="btn btn-ghost" disabled={text.length === 0} onClick={() => setText("")}>
            Kosongkan
          </button>
        </div>
      </div>

      {questions.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <h2 className="card-title" style={{ margin: 0 }}>Pratinjau hasil impor</h2>
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={plain}
              onClick={() => setPlain((prev) => !prev)}
            >
              {plain ? "Lihat sebagai matematika" : "Lihat sebagai teks biasa"}
            </button>
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
                {plain ? <span className="mono">{question.text}</span> : <MathText text={question.text} />}
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
                    <span>{plain ? option : <MathText text={option} />}</span>
                    {question.correctIndex === oIndex && <span className="correct-tag">Benar</span>}
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
      )}
    </main>
  )
}
