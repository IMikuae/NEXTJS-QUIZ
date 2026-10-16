"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CategoryThumb } from "@/components/TemplateCard"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { MathText } from "@/components/MathText"
import { BookIcon, CopyIcon, GradeIcon, PlayIcon } from "@/components/HomeIcons"
import { useAuth } from "@/lib/auth-store"
import { createQuiz } from "@/lib/quiz-storage"
import { CATEGORY_MAP } from "@/lib/templates-data"
import { describeSettings, normalizeSettings } from "@/components/QuizSettingsPanel"
import { deleteJson, getJson, postJson, putJson, saveHost } from "@/lib/room-client"
import { OPTION_LETTERS } from "@/lib/quiz-ui"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE DETAIL (klien) — memakai API (CONTRACT §5), bukan templates-data.js.
// Satu komponen melayani DUA sumber dengan sengaja:
//
//   template.id angka  → template SERVER (/api/templates/[id])
//   template.id string → template BAWAAN; prop dari server component hanya
//                        ringkasan tanpa kunci (untuk pratinjau). Data LENGKAP
//                        (dengan correctIndex) diambil dari
//                        /api/templates/builtin/[id] HANYA saat pengguna
//                        memilih memakai/menyalin/memainkan template.
//
// Aksi yang tersedia:
//   • Pakai / Mainkan  → klon template SERVER, lalu LANGSUNG buat room dan
//                        arahkan host ke /host/{code}. "Gunakan Template"
//                        tetap ada bila pengguna ingin mengedit dulu.
//   • Kloning          → POST /api/templates/[id]/clone (butuh login)
//   • Edit             → hanya pemilik (template.mine)
//   • Hapus            → hanya pemilik + konfirmasi
//
// Preview soal SENGAJA tidak menampilkan kunci jawaban saat template masih
// milik orang lain; kunci hanya dikirim server untuk template yang boleh dibaca
// (publik/pemilik), dan barulah penanda "Benar" dirender.
// ═══════════════════════════════════════════════════════════════════════════

/** Normalisasi bentuk template dari API ke bentuk yang dipakai UI ini. */
function shapeRemote(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    id: raw.id,
    source: "remote",
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    category: String(raw.category ?? "umum"),
    subject: raw.subject ?? null,
    gradeLevel: raw.gradeLevel ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    coverImage: raw.coverImage ?? null,
    visibility: raw.visibility === "public" ? "public" : "private",
    ownerId: raw.ownerId,
    ownerName: raw.ownerName ?? null,
    cloneCount: Number(raw.cloneCount ?? 0),
    mine: Boolean(raw.mine),
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    settings: normalizeSettings(raw.settings),
    questions: (Array.isArray(raw.questions) ? raw.questions : []).map((question) => ({
      text: String(question?.text ?? ""),
      options: Array.from({ length: 4 }, (_, index) => String(question?.options?.[index] ?? "")),
      timeSec: Number(question?.timeSec ?? 0) || 0,
      image: question?.image ?? null,
      optionImages: question?.optionImages ?? [null, null, null, null],
      explanation: question?.explanation ?? null,
      // null = kunci tidak dikirim server (bukan pemilik / tidak publik).
      correctIndex:
        Number.isInteger(question?.correctIndex) && question.correctIndex >= 0
          ? question.correctIndex
          : null,
    })),
  }
}

export function TemplateDetailClient({ template, autoUse = false }) {
  const router = useRouter()
  const { user, loaded: authLoaded } = useAuth()

  const [remote, setRemote] = useState(template?.source === "remote" ? shapeRemote(template) : null)
  const [loading, setLoading] = useState(template?.source === "remote")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("") // "" | "clone" | "play" | "delete"
  const [confirmDelete, setConfirmDelete] = useState(false)

  const model = remote ?? template
  const isRemote = Boolean(remote)
  const isMine = Boolean(model?.mine)
  const canWrite = isRemote && Boolean(user)

  // Muat ulang data lengkap dari API saat halaman dibuka dengan template server
  // (prop dari SSR hanya berisi ringkasan).
  useEffect(() => {
    if (template?.source !== "remote") return undefined
    let cancelled = false

    ;(async () => {
      const result = await getJson(`/api/templates/${template.id}`)
      if (cancelled) return
      if (!result.ok) {
        setError(result.error || "Template tidak bisa dibuka.")
        setLoading(false)
        return
      }
      setRemote(shapeRemote(result.data?.template))
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [template?.id, template?.source])

  /** Buat draft lokal dari data template ini (tanpa memanggil API). */
  const cloneIntoDraft = useCallback(
    (payload) => {
      const result = createQuiz({
        title: payload.title || "Kuis dari Template",
        description: payload.description ?? "",
        category: payload.category ?? "umum",
        subject: payload.subject ?? null,
        gradeLevel: payload.gradeLevel ?? null,
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        coverImage: payload.coverImage ?? null,
        visibility: payload.visibility ?? "private",
        sourceTemplateId: payload.sourceTemplateId ?? null,
        settings: payload.settings ?? null,
        questions: payload.questions ?? [],
      })
      if (!result.ok) {
        setError("Penyimpanan browser penuh. Hapus beberapa kuis lama lalu coba lagi.")
        return null
      }
      return result.data
    },
    []
  )

  /** Butuh login? Tampilkan ajakan alih-alih gagal diam-diam. */
  const requireLogin = useCallback((action) => {
    if (user) return true
    setError("")
    toast.info("Perlu masuk dulu", `Masuk atau daftar untuk ${action}.`)
    router.push("/masuk")
    return false
  }, [user, router])

  /**
   * Ambil data LENGKAP template bawaan (dengan kunci jawaban) dari API.
   * Kunci sengaja tidak ikut bundel klien; ia hanya diambil saat pengguna
   * benar-benar memakai/menyalin template. Mengembalikan null + setError bila
   * gagal.
   */
  const loadBuiltinSeed = useCallback(async () => {
    const result = await getJson(`/api/templates/builtin/${encodeURIComponent(template.id)}`)
    if (!result.ok || !result.data?.quiz) {
      setError(result.error || "Template bawaan tidak bisa dimuat.")
      return null
    }
    return result.data.quiz
  }, [template.id])

  // ── Kloning: template server → milik sendiri (di server), lalu masuk editor ──
  const onClone = useCallback(async () => {
    if (busy) return
    if (!isRemote) {
      // Template bawaan: ambil data lengkap (dengan kunci) lalu salin ke draft.
      setBusy("clone")
      setError("")
      const seed = await loadBuiltinSeed()
      setBusy("")
      if (!seed) return
      const draft = cloneIntoDraft(seed)
      if (draft) router.push(`/editor/${draft.id}`)
      return
    }
    if (!requireLogin("menyalin template ini")) return

    setBusy("clone")
    setError("")
    const result = await postJson(`/api/templates/${model.id}/clone`, {})
    setBusy("")

    if (!result.ok) {
      setError(result.error || "Gagal menyalin template.")
      return
    }

    const payload = shapeRemote(result.data?.template)
    if (!payload) {
      setError("Server tidak mengirim template hasil salinan.")
      return
    }

    const draft = cloneIntoDraft(payload)
    toast.success("Template disalin ke Kuis Saya", "Kamu bisa mengeditnya dulu.")
    if (draft) router.push(`/editor/${draft.id}`)
  }, [busy, isRemote, requireLogin, model, cloneIntoDraft, loadBuiltinSeed, router])

  // ── Mainkan: klon (bila perlu) → buat room → /host/{code} ──
  const onPlayNow = useCallback(async () => {
    if (busy) return
    if (!requireLogin("memainkan template ini")) return

    // Template bawaan: prop hanya berisi ringkasan (tanpa kunci). Ambil data
    // lengkap dari API sebelum validasi & pembuatan room.
    let base = model
    if (!isRemote) {
      const seed = await loadBuiltinSeed()
      if (!seed) return
      base = seed
    }

    if (!Array.isArray(base?.questions) || base.questions.length === 0) {
      setError("Template belum punya soal.")
      return
    }
    if (base.questions.some((question) => question.correctIndex === null || question.correctIndex === undefined)) {
      setError("Kunci jawaban template ini tidak tersedia untuk dimainkan langsung. Salin dulu ke Kuis Saya.")
      return
    }

    setBusy("play")
    setError("")

    let payload = base

    // Template server: kloning dulu supaya kunci jawaban ikut (server hanya
    // mengirim kunci untuk template yang boleh kita baca) DAN supaya hitungan
    // clone_count di server bertambah.
    if (isRemote) {
      const cloned = await postJson(`/api/templates/${model.id}/clone`, {})
      if (!cloned.ok) {
        setBusy("")
        setError(cloned.error || "Gagal menyiapkan salinan template.")
        return
      }
      payload = shapeRemote(cloned.data?.template) ?? model
    }

    const room = await postJson("/api/rooms", {
      title: String(payload.title || "Kuis Yue Quiz").slice(0, 80),
      settings: payload.settings,
      questions: payload.questions.map((question) => ({
        text: String(question.text ?? "").trim(),
        options: question.options.map((option) => String(option ?? "").trim()),
        correctIndex: question.correctIndex,
        timeSec: question.timeSec || 20,
        image: question.image ?? null,
        optionImages: question.optionImages ?? [null, null, null, null],
        explanation: question.explanation ?? null,
      })),
    })

    setBusy("")
    if (!room.ok) {
      setError(room.error || "Gagal membuat room.")
      return
    }
    const { code, hostToken } = room.data || {}
    if (!code || !hostToken) {
      setError("Server tidak mengirim kode room.")
      return
    }
    saveHost(code, hostToken)
    router.push(`/host/${code}`)
  }, [busy, requireLogin, model, isRemote, loadBuiltinSeed, router])

  const onDelete = useCallback(async () => {
    if (busy || !isRemote || !isMine) return
    setBusy("delete")
    setError("")
    const result = await deleteJson(`/api/templates/${model.id}`)
    setBusy("")
    setConfirmDelete(false)

    if (!result.ok) {
      setError(result.error || "Gagal menghapus template.")
      return
    }
    toast.success("Template dihapus", model.title)
    router.push("/templates?mine=1")
  }, [busy, isRemote, isMine, model, router])

  const onVisibility = useCallback(async () => {
    if (busy || !canWrite || !isMine) return
    const next = model.visibility === "public" ? "private" : "public"
    setBusy("visibility")
    setError("")

    const result = await putJson(`/api/templates/${model.id}`, {
      title: model.title,
      description: model.description,
      category: model.category,
      gradeLevel: model.gradeLevel,
      tags: model.tags,
      visibility: next,
      settings: model.settings,
      questions: model.questions.map((question) => ({
        text: question.text,
        options: question.options,
        correctIndex: question.correctIndex ?? 0,
        timeSec: question.timeSec || 20,
        image: question.image ?? null,
        optionImages: question.optionImages ?? [null, null, null, null],
        explanation: question.explanation ?? null,
      })),
    })

    setBusy("")
    if (!result.ok) {
      setError(result.error || "Gagal mengubah visibilitas.")
      return
    }
    setRemote(shapeRemote(result.data?.template))
    toast.success(
      next === "public" ? "Template jadi publik" : "Template jadi privat",
      next === "public" ? "Muncul di Template Library." : "Hanya kamu yang bisa melihatnya."
    )
  }, [busy, canWrite, isMine, model])

  // Tombol "Pakai" dari kartu (?use=1) → salin ke draft setelah akun terbaca.
  useEffect(() => {
    if (!autoUse || !authLoaded || busy || error) return
    if (template?.source === "remote") return

    // Template bawaan: ambil data lengkap (dengan kunci) sebelum menyalin, agar
    // draft hasilnya bisa langsung dimainkan.
    let cancelled = false
    ;(async () => {
      const result = await getJson(`/api/templates/builtin/${encodeURIComponent(template.id)}`)
      if (cancelled) return
      if (!result.ok || !result.data?.quiz) {
        setError(result.error || "Template bawaan tidak bisa dimuat.")
        return
      }
      const draft = cloneIntoDraft(result.data.quiz)
      if (!cancelled && draft) router.push(`/editor/${draft.id}`)
    })()

    return () => {
      cancelled = true
    }
  }, [autoUse, authLoaded, busy, error, template, cloneIntoDraft, router])

  const settingsText = useMemo(() => describeSettings(model?.settings).text, [model?.settings])
  const totalSec = useMemo(() => {
    const questions = model?.questions ?? []
    return questions.reduce((sum, question) => sum + (question.timeSec || 20), 0)
  }, [model?.questions])
  const showKey = useMemo(
    () => (model?.questions ?? []).every((question) => question.correctIndex !== null),
    [model?.questions]
  )

  if (loading) {
    return (
      <div className="card" style={{ marginTop: 6 }}>
        <div className="waiting">
          <span className="spinner" aria-hidden /> Memuat template…
        </div>
      </div>
    )
  }

  if (!model) {
    return (
      <div className="card" style={{ marginTop: 6 }}>
        <h1 className="card-title">Template tidak ditemukan</h1>
        <p className="card-hint">{error || "Data template tidak tersedia."}</p>
        <Link href="/templates" className="btn btn-primary">Kembali ke Template Library</Link>
      </div>
    )
  }

  return (
    <>
      <div className="card glass-card" style={{ marginTop: 6 }}>
        {model.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tpl-cover" src={model.coverImage} alt={`Sampul ${model.title}`} />
        ) : (
          <CategoryThumb category={model.category} />
        )}

        <div className="counter-row" style={{ marginTop: 14, paddingTop: 0, borderTop: "none" }}>
          <h1 className="card-title" style={{ fontSize: 26, margin: 0 }}>
            {model.title}
          </h1>
          <div className="btn-row">
            {model.visibility === "public" ? (
              <span className="tpl-badge is-success">Publik</span>
            ) : (
              <span className="tpl-badge">Privat</span>
            )}
            {isMine && <span className="tpl-badge is-warn">Milikmu</span>}
          </div>
        </div>

        <p className="card-hint" style={{ marginBottom: 16 }}>
          {model.description || "Tanpa deskripsi."}
        </p>

        {(model.subject || model.gradeLevel || (model.tags?.length ?? 0) > 0) && (
          <div className="tpl-tagrow">
            {model.subject ? (
              <span className="tpl-badge is-info">
                <BookIcon size={13} aria-hidden style={{ marginRight: 5 }} />
                {model.subject}
              </span>
            ) : null}
            {model.gradeLevel ? (
              <span className="tpl-badge">
                <GradeIcon size={13} aria-hidden style={{ marginRight: 5 }} />
                {model.gradeLevel}
              </span>
            ) : null}
            {(model.tags ?? []).map((tag) => (
              <span className="tag-chip" key={tag}>{tag}</span>
            ))}
          </div>
        )}

        <div className="metrics-grid">
          <div className="stat-card">
            <span className="stat-value">{model.questions.length}</span>
            <span className="stat-label">Soal</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{Math.max(1, Math.round(totalSec / 60))}</span>
            <span className="stat-label">Menit</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{CATEGORY_MAP[model.category]?.label ?? model.category}</span>
            <span className="stat-label">Kategori</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">
              {isRemote ? model.cloneCount : (model.author ?? "Yue Community")}
            </span>
            <span className="stat-label">{isRemote ? "Kali disalin" : "Penulis"}</span>
          </div>
        </div>

        <p className="footer-note" style={{ marginTop: 14, textAlign: "left" }}>
          <strong>Aturan permainan:</strong> {settingsText}
          {isRemote && model.ownerName ? ` · Pemilik: ${model.ownerName}` : ""}
        </p>

        {error && (
          <div className="alert alert-error" role="alert" style={{ marginTop: 16 }}>
            {error}
          </div>
        )}

        {!user && (
          <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 0 }}>
            Masuk dulu kalau ingin menyimpan template ini ke akunmu. Preview soal
            tetap bisa dibaca tanpa akun.
          </div>
        )}

        <div className="btn-row" style={{ marginTop: 20 }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={busy !== ""}
            onClick={onPlayNow}
          >
            {busy === "play" && <span className="spinner" aria-hidden />}
            {busy === "play" ? "Menyiapkan room…" : (
              <>
                <PlayIcon size={16} aria-hidden />
                Pakai / Mainkan
              </>
            )}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy !== ""}
            onClick={onClone}
          >
            {busy === "clone" && <span className="spinner" aria-hidden />}
            {busy === "clone" ? "Menyalin…" : (
              <>
                <CopyIcon size={16} aria-hidden />
                Salin ke Kuis Saya
              </>
            )}
          </button>
          {isMine && (
            <Link href={`/editor/new?template=${model.id}`} className="btn btn-ghost">
              Edit
            </Link>
          )}
          {isMine && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy !== ""}
              onClick={onVisibility}
            >
              {busy === "visibility" && <span className="spinner" aria-hidden />}
              {model.visibility === "public" ? "Jadikan privat" : "Jadikan publik"}
            </button>
          )}
          {isMine && (
            <button
              type="button"
              className="btn btn-danger btn-ghost"
              disabled={busy !== ""}
              onClick={() => setConfirmDelete(true)}
            >
              Hapus
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Preview Soal</h2>
          {!showKey && (
            <span className="stat-label">
              Kunci jawaban hanya tampil untuk template milikmu atau yang publik
            </span>
          )}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          {model.questions.map((question, index) => (
            <div className="question-block" key={index} style={{ marginBottom: 0 }}>
              <div className="question-head">
                <span className="question-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {question.timeSec ? (
                  <span className="pct-big" style={{ fontSize: 12.5 }}>{question.timeSec}s</span>
                ) : null}
              </div>

              {question.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="question-image"
                  src={question.image}
                  alt={`Gambar soal ${index + 1}`}
                />
              ) : null}

              <div className="preview-text">
                <MathText text={question.text} as="p" />
              </div>

              <div className="preview-options">
                {question.options.map((option, oIndex) => (
                  <div
                    className={`option-card${question.correctIndex === oIndex ? " is-preview-correct" : ""}`}
                    key={oIndex}
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
                    <span>{option ? <MathText text={option} /> : <em>(kosong)</em>}</span>
                    {question.correctIndex === oIndex && <span className="correct-tag">Benar</span>}
                  </div>
                ))}
              </div>

              {question.explanation ? (
                <p className="preview-explanation">
                  <strong>Penjelasan: </strong>
                  <MathText text={question.explanation} />
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus template ini?"
        message={`"${model.title}" akan dihapus dari server. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus template"
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
