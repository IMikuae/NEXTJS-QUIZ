"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { useAuth } from "@/lib/auth-store"
import {
  deleteQuiz,
  duplicateQuiz,
  listQuizzes,
  saveQuizAsTemplate,
} from "@/lib/quiz-storage"
import { CATEGORY_MAP } from "@/lib/templates-data"
import { describeSettings } from "@/components/QuizSettingsPanel"
import { validateDraft } from "@/lib/quiz-validate"
import { deleteJson, getJson, postJson, saveHost } from "@/lib/room-client"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// KUIS SAYA — dua tab dengan DUA backend yang berbeda (CONTRACT §5):
//
//   "Quiz Saya"     → draft LOKAL lewat quiz-storage.js (localStorage).
//                     Aksi: Edit · Play · Duplikat · Simpan sbg Template · Hapus
//   "Quiz Server"   → GET /api/templates?mine=1, template milik akun yang login.
//                     Aksi: Edit (muat ke editor) · Kloning · Hapus
//
// Dua tab ini SENGAJA dipisah, bukan digabung: yang satu hidup di browser ini
// saja (bisa dipakai tanpa akun), yang satu hidup di server dan hanya muncul
// kalau sudah masuk. Menggabungkannya akan membuat "Kuis Saya" menampilkan
// daftar yang hilang begitu berganti perangkat tanpa penjelasan.
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_TABS = [
  { id: "all", label: "Semua" },
  { id: "draft", label: "Draft" },
  { id: "published", label: "Published" },
  { id: "template", label: "Template Lokal" },
]

/** Template lokal tidak punya status draft/published — selalu dianggap terbit. */
function statusOf(item) {
  if (item.kind === "template") return "template"
  return item.status === "published" ? "published" : "draft"
}

function timeAgo(timestamp) {
  if (!timestamp) return "belum diketahui"
  const diffMs = Date.now() - timestamp
  const minutes = Math.round(diffMs / 60000)
  if (minutes < 1) return "baru saja"
  if (minutes < 60) return `${minutes} menit lalu`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} jam lalu`
  const days = Math.round(hours / 24)
  return `${days} hari lalu`
}

function timeAgoIso(iso) {
  if (!iso) return "belum diketahui"
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return "belum diketahui"
  return timeAgo(parsed)
}

export default function MyQuizzesClient() {
  const router = useRouter()
  const { user, loaded: authLoaded } = useAuth()

  const [view, setView] = useState("local") // local | server
  const [items, setItems] = useState(null) // null = belum dimuat (skeleton)
  const [tab, setTab] = useState("all")
  const [serverRows, setServerRows] = useState([])
  const [serverState, setServerState] = useState("idle") // idle | loading | ready | error
  const [serverError, setServerError] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmServerDelete, setConfirmServerDelete] = useState(null)
  const [playingId, setPlayingId] = useState(null)
  const [busyKey, setBusyKey] = useState("")

  const reload = useCallback(() => setItems(listQuizzes()), [])

  // Muat daftar lokal SETELAH akun selesai dibaca — quiz-storage memisahkan
  // data per pemilik (akun atau "tamu").
  useEffect(() => {
    if (!authLoaded) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- baca localStorage setelah auth (external)
    reload()
  }, [authLoaded, user?.id, reload])

  const loadServer = useCallback(async () => {
    if (!user) {
      setServerRows([])
      setServerState("idle")
      return
    }
    setServerState("loading")
    setServerError("")
    const result = await getJson("/api/templates?mine=1")
    if (!result.ok) {
      setServerState("error")
      setServerError(result.error || "Template tidak bisa dimuat.")
      return
    }
    const list = Array.isArray(result.data?.templates) ? result.data.templates : []
    setServerRows(list)
    setServerState("ready")
  }, [user])

  useEffect(() => {
    if (view !== "server") return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- muat template server saat tab dibuka (external)
    loadServer()
  }, [view, loadServer])

  const visible = useMemo(() => {
    if (!items) return []
    if (tab === "all") return items
    return items.filter((item) => statusOf(item) === tab)
  }, [items, tab])

  // ── Aksi pada draft LOKAL ──
  const onPlay = useCallback(
    async (item) => {
      if (playingId) return
      const { ok, problems } = validateDraft(item)
      if (!ok) {
        toast.error("Kuis belum siap dimainkan", problems[0])
        return
      }

      setPlayingId(item.id)
      const result = await postJson("/api/rooms", {
        title: item.title.trim() || "Kuis Yue Quiz",
        settings: item.settings ?? undefined,
        questions: item.questions.map((question) => ({
          text: question.text.trim(),
          options: question.options.map((option) => option.trim()),
          correctIndex: question.correctIndex,
          timeSec: question.timeSec,
          image: question.image ?? null,
          optionImages: question.optionImages ?? [null, null, null, null],
          explanation: question.explanation ?? null,
        })),
      })
      setPlayingId(null)

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
    },
    [playingId, router]
  )

  const onDuplicate = useCallback(
    (item) => {
      const result = duplicateQuiz(item.id)
      if (!result.ok) {
        toast.error("Gagal menduplikat", result.error === "quota" ? "Penyimpanan penuh." : "Coba lagi.")
        return
      }
      toast.success("Kuis diduplikat", result.data.title)
      reload()
    },
    [reload]
  )

  const onSaveAsTemplate = useCallback(
    (item) => {
      const result = saveQuizAsTemplate(item.id)
      if (!result.ok) {
        toast.error("Gagal menyimpan template", result.error === "quota" ? "Penyimpanan penuh." : "Coba lagi.")
        return
      }
      toast.success("Tersimpan sebagai template lokal", result.data.title)
      reload()
    },
    [reload]
  )

  const onDelete = useCallback(
    (item) => {
      const result = deleteQuiz(item.id)
      if (!result.ok) {
        toast.error("Gagal menghapus", "Coba lagi.")
        return
      }
      toast.success("Terhapus", item.title)
      setConfirmDelete(null)
      reload()
    },
    [reload]
  )

  /** Kirim template LOKAL ke server (butuh login). */
  const onUploadTemplate = useCallback(
    async (item) => {
      if (busyKey) return
      if (!user) {
        toast.info("Perlu masuk dulu", "Template server butuh akun.")
        router.push("/masuk")
        return
      }

      const { ok, problems } = validateDraft(item)
      if (!ok) {
        toast.error("Belum bisa diunggah", problems[0])
        return
      }

      setBusyKey(item.id)
      const result = await postJson("/api/templates", {
        title: item.title.trim().slice(0, 80) || "Template tanpa judul",
        description: String(item.description ?? "").slice(0, 300),
        category: item.category ?? "umum",
        visibility: "private",
        settings: item.settings ?? undefined,
        questions: item.questions.map((question) => ({
          text: question.text.trim(),
          options: question.options.map((option) => option.trim()),
          correctIndex: question.correctIndex,
          timeSec: question.timeSec,
          image: question.image ?? null,
          optionImages: question.optionImages ?? [null, null, null, null],
          explanation: question.explanation ?? null,
        })),
      })
      setBusyKey("")

      if (!result.ok) {
        toast.error("Gagal mengunggah template", result.error || "Coba lagi.")
        return
      }
      toast.success("Template tersimpan di server", "Lihat tab Quiz Server.")
      setView("server")
    },
    [busyKey, user, router]
  )

  // ── Aksi pada template SERVER ──
  const onCloneServer = useCallback(
    async (row) => {
      if (busyKey) return
      setBusyKey(`c-${row.id}`)
      const result = await postJson(`/api/templates/${row.id}/clone`, {})
      setBusyKey("")
      if (!result.ok) {
        toast.error("Gagal menyalin", result.error || "Coba lagi.")
        return
      }
      toast.success("Template disalin", "Salinan baru ada di daftar ini.")
      loadServer()
    },
    [busyKey, loadServer]
  )

  const onDeleteServer = useCallback(async () => {
    const row = confirmServerDelete
    if (!row) return
    setBusyKey(`d-${row.id}`)
    const result = await deleteJson(`/api/templates/${row.id}`)
    setBusyKey("")
    setConfirmServerDelete(null)
    if (!result.ok) {
      toast.error("Gagal menghapus", result.error || "Coba lagi.")
      return
    }
    toast.success("Template dihapus", row.title)
    loadServer()
  }, [confirmServerDelete, loadServer])

  const onPlayServer = useCallback(
    async (row) => {
      if (busyKey) return
      if (!row.mine) {
        toast.info("Bukan milikmu", "Salin dulu template ini untuk memainkannya.")
        return
      }
      const questions = Array.isArray(row.questions) ? row.questions : []
      if (questions.length === 0) {
        toast.error("Template kosong", "Template ini tidak punya soal.")
        return
      }

      setBusyKey(`p-${row.id}`)
      const room = await postJson("/api/rooms", {
        title: String(row.title ?? "Kuis Yue Quiz").slice(0, 80),
        settings: row.settings,
        questions: questions.map((question) => ({
          text: String(question.text ?? "").trim(),
          options: (question.options ?? []).map((option) => String(option ?? "").trim()),
          correctIndex: question.correctIndex,
          timeSec: question.timeSec ?? 20,
          image: question.image ?? null,
          optionImages: question.optionImages ?? [null, null, null, null],
          explanation: question.explanation ?? null,
        })),
      })
      setBusyKey("")

      if (!room.ok) {
        toast.error("Gagal membuat room", room.error || "Coba lagi.")
        return
      }
      const { code, hostToken } = room.data || {}
      if (!code || !hostToken) {
        toast.error("Server tidak mengirim kode room", "Coba lagi.")
        return
      }
      saveHost(code, hostToken)
      router.push(`/host/${code}`)
    },
    [busyKey, router]
  )

  return (
    <main className="page" style={{ maxWidth: 1120 }}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <div>
          <h1 className="page-title" style={{ fontSize: "clamp(26px, 5vw, 38px)", margin: 0 }}>
            Kuis Saya
          </h1>
          <p className="footer-note" style={{ margin: "6px 0 0", textAlign: "left" }}>
            {user ? (
              <>
                Masuk sebagai <strong>{user.name}</strong> ·{" "}
                <Link href="/masuk" className="link">ganti akun</Link>
              </>
            ) : (
              <>
                Draft tersimpan sebagai <strong>tamu</strong> di perangkat ini ·{" "}
                <Link href="/masuk" className="link">masuk agar bisa pakai template server</Link>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => router.push("/editor/new")}
        >
          + Buat Quiz
        </button>
      </div>

      <div className="tab-row" style={{ marginTop: 22 }} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={view === "local"}
          className={`tab${view === "local" ? " is-active" : ""}`}
          onClick={() => setView("local")}
        >
          Quiz Saya (draft lokal)
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "server"}
          className={`tab${view === "server" ? " is-active" : ""}`}
          onClick={() => setView("server")}
        >
          Kuis Server
        </button>
      </div>

      {view === "local" ? (
        <>
          <div className="tab-row" role="tablist">
            {LOCAL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {items === null ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="skeleton" style={{ height: 96 }} />
              <div className="skeleton" style={{ height: 96 }} />
              <div className="skeleton" style={{ height: 96 }} />
            </div>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={tab === "template" ? "🏷️" : "📭"}
              title={tab === "template" ? "Belum ada template lokal" : "Belum ada kuis"}
              description={
                tab === "template"
                  ? "Simpan kuis sebagai template agar bisa dipakai ulang kapan saja."
                  : "Mulai dari nol atau gunakan template yang sudah tersedia."
              }
            >
              {tab !== "template" && <Link href="/templates" className="btn">Jelajahi Template</Link>}
              <button type="button" className="btn btn-primary" onClick={() => router.push("/editor/new")}>
                Buat Quiz
              </button>
            </EmptyState>
          ) : (
            <div className="quiz-grid">
              {visible.map((item) => (
                <article className="quiz-card" key={item.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, minWidth: 0 }}>
                      {item.title}
                    </h3>
                    {item.kind === "template" ? (
                      <span className="tpl-badge is-warn">Template</span>
                    ) : item.status === "published" ? (
                      <span className="tpl-badge is-success">Published</span>
                    ) : (
                      <span className="tpl-badge">Draft</span>
                    )}
                  </div>

                  <div className="tpl-meta">
                    <span>{item.questions.length} soal</span>
                    <span>• Terakhir diedit {timeAgo(item.updatedAt)}</span>
                  </div>

                  <div className="tpl-meta">
                    <span>{CATEGORY_MAP[item.category]?.label ?? item.category ?? "Umum"}</span>
                    {item.settings ? (
                      <span className="tpl-badge">{describeSettings(item.settings).mode}</span>
                    ) : (
                      <span className="tpl-badge">Aturan bawaan</span>
                    )}
                  </div>

                  <div className="quiz-card-actions">
                    <Link href={`/editor/${item.id}`} className="btn btn-sm">Edit</Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={playingId === item.id}
                      onClick={() => onPlay(item)}
                    >
                      {playingId === item.id && <span className="spinner" aria-hidden />}
                      ▶ Play
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => onDuplicate(item)}>
                      Duplikat
                    </button>
                    {item.kind !== "template" && (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSaveAsTemplate(item)}>
                        Simpan lokal
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={busyKey === item.id}
                      title={user ? "Unggah ke server sebagai template" : "Perlu masuk dulu"}
                      onClick={() => onUploadTemplate(item)}
                    >
                      {busyKey === item.id && <span className="spinner" aria-hidden />}
                      ⬆ Ke server
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      aria-label={`Hapus ${item.title}`}
                      onClick={() => setConfirmDelete(item)}
                    >
                      🗑
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      ) : !user ? (
        <EmptyState
          icon="🔒"
          title="Masuk untuk melihat kuis di server"
          description="Template server tersimpan di akunmu. Masuk atau daftar — gratis, tanpa email."
        >
          <Link href="/masuk" className="btn btn-primary">Masuk / Daftar</Link>
        </EmptyState>
      ) : (
        <>
          <div className="btn-row" style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-sm btn-ghost" onClick={loadServer}>
              ⟳ Muat ulang
            </button>
            <span className="stat-label" style={{ alignSelf: "center" }}>
              {serverState === "loading" ? "Memuat…" : `${serverRows.length} template di server`}
            </span>
          </div>

          {serverError && (
            <div className="alert alert-error" role="alert">{serverError}</div>
          )}

          {serverState === "loading" ? (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="skeleton" style={{ height: 88 }} />
              <div className="skeleton" style={{ height: 88 }} />
            </div>
          ) : serverRows.length === 0 ? (
            <EmptyState
              icon="🏷️"
              title="Belum ada template di server"
              description="Simpan draft sebagai template dari editor, atau unggah dari tab Quiz Saya."
            >
              <button type="button" className="btn btn-primary" onClick={() => setView("local")}>
                Lihat draft lokal
              </button>
            </EmptyState>
          ) : (
            <div className="quiz-grid">
              {serverRows.map((row) => {
                const questionCount = Array.isArray(row.questions) ? row.questions.length : 0
                const totalSec = (row.questions ?? []).reduce(
                  (sum, question) => sum + (Number(question?.timeSec) || 20),
                  0
                )
                return (
                  <article className="quiz-card" key={row.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1, minWidth: 0 }}>
                        {row.title}
                      </h3>
                      {row.visibility === "public" ? (
                        <span className="tpl-badge is-success">Publik</span>
                      ) : (
                        <span className="tpl-badge">Privat</span>
                      )}
                      {row.mine && <span className="tpl-badge is-warn">Milikmu</span>}
                    </div>

                    <div className="tpl-meta">
                      <span>{questionCount} soal</span>
                      <span>⏱ {Math.max(1, Math.round(totalSec / 60))} menit</span>
                      <span>• Diperbarui {timeAgoIso(row.updatedAt)}</span>
                    </div>

                    <div className="tpl-meta">
                      <span>{CATEGORY_MAP[row.category]?.label ?? row.category ?? "Umum"}</span>
                      <span>⧉ {Number(row.cloneCount ?? 0)}× disalin</span>
                      {row.settings ? (
                        <span className="tpl-badge">{describeSettings(row.settings).mode}</span>
                      ) : null}
                    </div>

                    <div className="quiz-card-actions">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busyKey === `c-${row.id}`}
                        onClick={() => onCloneServer(row)}
                      >
                        {busyKey === `c-${row.id}` && <span className="spinner" aria-hidden />}
                        Kloning
                      </button>
                      <Link href={`/templates/${row.id}`} className="btn btn-sm btn-ghost">
                        Buka
                      </Link>
                      {row.mine && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            disabled={busyKey === `p-${row.id}`}
                            onClick={() => onPlayServer(row)}
                          >
                            {busyKey === `p-${row.id}` && <span className="spinner" aria-hidden />}
                            ▶ Mainkan
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost"
                            aria-label={`Hapus template ${row.title}`}
                            disabled={busyKey === `d-${row.id}`}
                            onClick={() => setConfirmServerDelete(row)}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Hapus kuis ini?"
        message={`"${confirmDelete?.title}" akan dihapus permanen dari browser ini.`}
        confirmLabel="Hapus"
        onConfirm={() => onDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmServerDelete !== null}
        title="Hapus template di server?"
        message={`"${confirmServerDelete?.title}" akan dihapus dari server. Salinan yang sudah dikloning orang lain tidak terpengaruh.`}
        confirmLabel="Hapus template"
        onConfirm={onDeleteServer}
        onCancel={() => setConfirmServerDelete(null)}
      />
    </main>
  )
}
