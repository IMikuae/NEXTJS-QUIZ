"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CATEGORY_ICONS, CategoryThumb, TemplateCard } from "@/components/TemplateCard"
import { EmptyState } from "@/components/EmptyState"
import { ErrorState } from "@/components/AsyncState"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import {
  BulbIcon,
  CopyIcon,
  LockIcon,
  PlayIcon,
  RefreshIcon,
  SearchIcon,
  SlidersIcon,
  SparkIcon,
  TrashIcon,
} from "@/components/HomeIcons"
import { useAuth } from "@/lib/auth-store"
import { CATEGORIES, TEMPLATE_INDEX } from "@/lib/templates-data"
import { deleteJson, getJson, postJson, saveHost } from "@/lib/room-client"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE LIBRARY — memakai API (CONTRACT §5), bukan templates-data.
//   • Tab "Jelajahi"  → GET /api/templates?q=&category=  (hanya publik)
//   • Tab "Template Saya" → GET /api/templates?mine=1    (wajib login)
//   • Bawaan (templates-data) ditampilkan sebagai "Koleksi Bawaan" di tab
//     Jelajahi — bukan sumber kebenaran daftar, hanya contoh siap pakai
//     supaya halaman tetap berisi saat server masih kosong.
//   • Aksi per kartu: Preview, Pakai (salin lalu mainkan), Kloning, Edit
//     (pemilik), Hapus (pemilik + konfirmasi).
//
// Pencarian & filter kategori dikirim ke server (server yang memfilter), tapi
// kata kunci juga di-debounce 300 ms supaya tidak membanjiri API.
// ═══════════════════════════════════════════════════════════════════════════

const SEARCH_DEBOUNCE_MS = 300

const SORTS = [
  { id: "newest", label: "Terbaru" },
  { id: "title", label: "Judul A–Z" },
  { id: "clones", label: "Paling banyak disalin" },
]

/** Bentuk kartu seragam dari respons API. */
function shapeRemote(raw) {
  if (!raw || typeof raw !== "object") return null
  return {
    key: `srv-${raw.id}`,
    id: raw.id,
    source: "remote",
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    category: String(raw.category ?? "umum"),
    subject: raw.subject ?? null,
    coverImage: raw.coverImage ?? null,
    level: raw.gradeLevel ? "menengah" : "dasar",
    author: raw.ownerName ?? "Yue Quiz",
    questionCount: Array.isArray(raw.questions) ? raw.questions.length : 0,
    estimatedTimeMin: Math.max(
      1,
      Math.round(
        (Array.isArray(raw.questions) ? raw.questions : []).reduce(
          (sum, question) => sum + (Number(question?.timeSec) || 20),
          0
        ) / 60
      )
    ),
    usageCount: Number(raw.cloneCount ?? 0),
    rating: 0,
    visibility: raw.visibility,
    mine: Boolean(raw.mine),
    updatedAt: raw.updatedAt ?? null,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    gradeLevel: raw.gradeLevel ?? null,
  }
}

export default function TemplatesClient({ initialTab = "explore" }) {
  const router = useRouter()
  const { user, loaded: authLoaded } = useAuth()

  const [tab, setTab] = useState(initialTab) // explore | mine
  const [keyword, setKeyword] = useState("")
  const [debounced, setDebounced] = useState("")
  const [category, setCategory] = useState("all")
  const [subject, setSubject] = useState("all")
  const [gradeLevel, setGradeLevel] = useState("all")
  const [tag, setTag] = useState("all")
  const [sort, setSort] = useState("newest")
  const [sheetOpen, setSheetOpen] = useState(false)

  const [rows, setRows] = useState(null) // null = memuat
  const [facets, setFacets] = useState({ subjects: [], gradeLevels: [], tags: [] })
  const [loadError, setLoadError] = useState("")
  const [busyKey, setBusyKey] = useState("")
  const [deleteTarget, setDeleteTarget] = useState(null)
  const requestSeq = useRef(0)

  // Debounce pencarian.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [keyword])

  const load = useCallback(async () => {
    const seq = requestSeq.current + 1
    requestSeq.current = seq

    setRows(null)
    setLoadError("")

    const params = new URLSearchParams()
    if (debounced) params.set("q", debounced)
    if (category !== "all") params.set("category", category)
    if (subject !== "all") params.set("subject", subject)
    if (gradeLevel !== "all") params.set("gradeLevel", gradeLevel)
    if (tag !== "all") params.set("tag", tag)
    if (tab === "mine") params.set("mine", "1")
    params.set("facets", "1")
    const query = params.toString()

    const result = await getJson(`/api/templates?${query}`)

    // Respons datang terlambat (pengguna sudah mengubah filter) → buang.
    if (requestSeq.current !== seq) return

    if (!result.ok) {
      setRows([])
      setLoadError(result.error || "Daftar template tidak bisa dimuat.")
      return
    }

    const list = Array.isArray(result.data?.templates) ? result.data.templates : []
    setRows(list.map(shapeRemote).filter(Boolean))
    if (result.data?.facets) {
      setFacets({
        subjects: result.data.facets.subjects ?? [],
        gradeLevels: result.data.facets.gradeLevels ?? [],
        tags: result.data.facets.tags ?? [],
      })
    }
  }, [debounced, category, subject, gradeLevel, tag, tab])

  useEffect(() => {
    if (tab === "mine" && authLoaded && !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset saat tab butuh login (external)
      setRows([])
      setLoadError("")
      return
    }
    if (!authLoaded) return
    load()
  }, [tab, authLoaded, user, load])

  // ── Turunan tampilan ──
  const sortRows = useCallback(
    (list) => {
      const sorted = [...list]
      if (sort === "newest") {
        sorted.sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")))
      } else if (sort === "title") {
        sorted.sort((a, b) => a.title.localeCompare(b.title, "id"))
      } else if (sort === "clones") {
        sorted.sort((a, b) => b.usageCount - a.usageCount)
      }
      return sorted
    },
    [sort]
  )

  const remoteRows = useMemo(() => sortRows(rows ?? []), [rows, sortRows])

  /** Koleksi bawaan (client-side, tersanitasi) — hanya di tab Jelajahi. */
  const builtinRows = useMemo(() => {
    if (tab !== "explore") return []
    const lowered = debounced.toLowerCase()
    return TEMPLATE_INDEX.filter((template) => {
      if (category !== "all" && template.category !== category) return false
      if (!lowered) return true
      const label = CATEGORIES.find((c) => c.id === template.category)?.label ?? ""
      return (
        template.title.toLowerCase().includes(lowered) ||
        template.description.toLowerCase().includes(lowered) ||
        label.toLowerCase().includes(lowered)
      )
    }).map((template) => ({
      ...template,
      key: `builtin-${template.id}`,
      source: "builtin",
      mine: false,
    }))
  }, [tab, debounced, category])

  const featured = useMemo(() => TEMPLATE_INDEX.filter((t) => t.featured).slice(0, 5), [])

  // ── Aksi ──
  const requireLogin = useCallback(
    (action) => {
      if (user) return true
      toast.info("Perlu masuk dulu", `Masuk atau daftar untuk ${action}.`)
      router.push("/masuk")
      return false
    },
    [user, router]
  )

  const onClone = useCallback(
    async (row) => {
      if (busyKey) return
      if (row.source === "builtin") {
        router.push(`/templates/${row.id}?use=1`)
        return
      }
      if (!requireLogin("menyalin template ini")) return

      setBusyKey(row.key)
      const result = await postJson(`/api/templates/${row.id}/clone`, {})
      setBusyKey("")

      if (!result.ok) {
        toast.error("Gagal menyalin", result.error || "Coba lagi.")
        return
      }
      toast.success("Template disalin", "Buka tab Template Saya untuk mengeditnya.")
      if (tab === "mine") load()
    },
    [busyKey, requireLogin, router, tab, load]
  )

  const onPlay = useCallback(
    async (row) => {
      if (busyKey) return
      if (row.source === "builtin") {
        router.push(`/templates/${row.id}?use=1`)
        return
      }
      if (!requireLogin("memainkan template ini")) return

      setBusyKey(row.key)

      // Kloning dulu supaya kunci jawaban tersedia untuk room.
      const cloned = await postJson(`/api/templates/${row.id}/clone`, {})
      if (!cloned.ok) {
        setBusyKey("")
        toast.error("Gagal menyiapkan template", cloned.error || "Coba lagi.")
        return
      }

      const payload = cloned.data?.template
      const questions = Array.isArray(payload?.questions) ? payload.questions : []
      if (questions.length === 0) {
        setBusyKey("")
        toast.error("Template kosong", "Template ini tidak punya soal.")
        return
      }

      const room = await postJson("/api/rooms", {
        title: String(payload.title ?? row.title).slice(0, 80),
        settings: payload.settings,
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
    [busyKey, requireLogin, router]
  )

  const onDelete = useCallback(async () => {
    const row = deleteTarget
    if (!row || row.source !== "remote") return

    setBusyKey(row.key)
    const result = await deleteJson(`/api/templates/${row.id}`)
    setBusyKey("")
    setDeleteTarget(null)

    if (!result.ok) {
      toast.error("Gagal menghapus", result.error || "Coba lagi.")
      return
    }
    toast.success("Template dihapus", row.title)
    load()
  }, [deleteTarget, load])

  // ── Panel filter (sidebar desktop & bottom sheet mobile) ──
  const filterPanel = (
    <>
      <div>
        <h3 className="filter-group-title">Urutkan</h3>
        <div className="filter-options">
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip${sort === option.id ? " is-active" : ""}`}
              style={{ justifyContent: "flex-start" }}
              onClick={() => setSort(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="filter-group-title">Kategori</h3>
        <div className="filter-options">
          <button
            type="button"
            className={`chip${category === "all" ? " is-active" : ""}`}
            style={{ justifyContent: "flex-start" }}
            onClick={() => setCategory("all")}
          >
            Semua
          </button>
          {CATEGORIES.map((cat) => {
            const CatIcon = CATEGORY_ICONS[cat.id] || BulbIcon
            return (
              <button
                key={cat.id}
                type="button"
                className={`chip${category === cat.id ? " is-active" : ""}`}
                style={{ justifyContent: "flex-start" }}
                onClick={() => setCategory(cat.id)}
              >
                <CatIcon size={15} aria-hidden />
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {facets.subjects.length > 0 && (
        <div>
          <h3 className="filter-group-title">Mata pelajaran</h3>
          <div className="filter-options">
            <button
              type="button"
              className={`chip${subject === "all" ? " is-active" : ""}`}
              style={{ justifyContent: "flex-start" }}
              onClick={() => setSubject("all")}
            >
              Semua
            </button>
            {facets.subjects.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip${subject === item ? " is-active" : ""}`}
                style={{ justifyContent: "flex-start" }}
                onClick={() => setSubject(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {facets.gradeLevels.length > 0 && (
        <div>
          <h3 className="filter-group-title">Jenjang / kelas</h3>
          <div className="filter-options">
            <button
              type="button"
              className={`chip${gradeLevel === "all" ? " is-active" : ""}`}
              style={{ justifyContent: "flex-start" }}
              onClick={() => setGradeLevel("all")}
            >
              Semua
            </button>
            {facets.gradeLevels.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip${gradeLevel === item ? " is-active" : ""}`}
                style={{ justifyContent: "flex-start" }}
                onClick={() => setGradeLevel(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      {facets.tags.length > 0 && (
        <div>
          <h3 className="filter-group-title">Tag</h3>
          <div className="filter-options">
            <button
              type="button"
              className={`chip${tag === "all" ? " is-active" : ""}`}
              style={{ justifyContent: "flex-start" }}
              onClick={() => setTag("all")}
            >
              Semua
            </button>
            {facets.tags.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip${tag === item ? " is-active" : ""}`}
                style={{ justifyContent: "flex-start" }}
                onClick={() => setTag(item)}
              >
                #{item}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )

  const totalVisible = remoteRows.length + builtinRows.length

  return (
    <main className="page" style={{ maxWidth: 1200 }}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <h1 className="page-title" style={{ fontSize: "clamp(26px, 5vw, 38px)" }}>
        Template Kuis
      </h1>
      <p className="page-subtitle">
        Jelajahi template publik dari komunitas, atau kelola template yang kamu
        simpan sendiri.
      </p>

      <div className="tab-row" role="tablist" style={{ marginTop: 20 }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "explore"}
          className={`tab${tab === "explore" ? " is-active" : ""}`}
          onClick={() => setTab("explore")}
        >
          Jelajahi
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "mine"}
          className={`tab${tab === "mine" ? " is-active" : ""}`}
          onClick={() => setTab("mine")}
        >
          Template Saya{user ? "" : " (perlu masuk)"}
        </button>
      </div>

      {tab === "mine" && !user ? (
        <EmptyState
          icon={<LockIcon size={38} />}
          title="Masuk dulu untuk melihat template milikmu"
          description="Template tersimpan di akun server. Masuk atau daftar — gratis, tanpa email."
        >
          <Link href="/masuk" className="btn btn-primary">Masuk / Daftar</Link>
        </EmptyState>
      ) : (
        <>
          <div style={{ marginTop: 6 }}>
            <input
              type="search"
              className="search-input"
              placeholder="Cari judul, topik, atau mata pelajaran…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              aria-label="Cari template"
            />
          </div>

          <div className="chip-row is-scrollable" style={{ marginTop: 16 }}>
            <button
              type="button"
              className={`chip${category === "all" ? " is-active" : ""}`}
              onClick={() => setCategory("all")}
            >
              Semua
            </button>
            {CATEGORIES.map((cat) => {
              const CatIcon = CATEGORY_ICONS[cat.id] || BulbIcon
              return (
                <button
                  key={cat.id}
                  type="button"
                  className={`chip${category === cat.id ? " is-active" : ""}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <CatIcon size={15} aria-hidden />
                  {cat.label}
                </button>
              )
            })}
          </div>

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-sm btn-ghost library-mobile-filter"
              onClick={() => setSheetOpen(true)}
            >
              <SlidersIcon size={15} aria-hidden />
              Filter &amp; urutkan
            </button>
            <span className="stat-label" style={{ alignSelf: "center" }}>
              {rows === null
                ? "Memuat…"
                : `${totalVisible} template`}
              {tab === "explore" && builtinRows.length > 0
                ? ` · ${builtinRows.length} bawaan`
                : ""}
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={load}>
              <RefreshIcon size={15} aria-hidden />
              Muat ulang
            </button>
            <Link href="/editor/new" className="btn btn-sm btn-primary">
              + Buat Quiz
            </Link>
          </div>

          {loadError && <ErrorState message={loadError} onRetry={load} marginTop={14} />}

          {tab === "explore" && category === "all" && !debounced && featured.length > 0 && (
            <section style={{ marginTop: 28 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 19, fontWeight: 800 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <SparkIcon size={19} aria-hidden />
                  Pilihan Redaksi
                </span>
              </h2>
              <div className="chip-row is-scrollable">
                {featured.map((template) => (
                  <div key={template.id} style={{ minWidth: 260 }}>
                    <TemplateCard template={template} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="library-layout">
            <aside className="filter-sidebar" aria-label="Filter template">
              {filterPanel}
            </aside>

            <div>
              {rows === null ? (
                <div className="tpl-grid" style={{ marginTop: 22 }}>
                  <div className="skeleton" style={{ height: 220 }} />
                  <div className="skeleton" style={{ height: 220 }} />
                  <div className="skeleton" style={{ height: 220 }} />
                </div>
              ) : remoteRows.length === 0 && builtinRows.length === 0 ? (
                <EmptyState
                  icon={<SearchIcon size={38} />}
                  title={tab === "mine" ? "Belum ada template milikmu" : "Template tidak ditemukan"}
                  description={
                    tab === "mine"
                      ? "Simpan kuis sebagai template dari editor, atau salin template publik di tab Jelajahi."
                      : "Coba kata kunci lain atau buat kuis sendiri dari nol."
                  }
                >
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setKeyword("")
                      setCategory("all")
                      setSubject("all")
                      setGradeLevel("all")
                      setTag("all")
                    }}
                  >
                    Reset pencarian
                  </button>
                  <Link href="/editor/new" className="btn btn-primary">Buat Quiz</Link>
                </EmptyState>
              ) : (
                <>
                  {remoteRows.length > 0 && (
                    <>
                      {tab === "explore" && (
                        <h2 className="library-group-title">Dari komunitas</h2>
                      )}
                      <div className="tpl-grid">
                        {remoteRows.map((row) => (
                          <RemoteTemplateCard
                            key={row.key}
                            row={row}
                            busy={busyKey === row.key}
                            onClone={() => onClone(row)}
                            onPlay={() => onPlay(row)}
                            onDelete={() => setDeleteTarget(row)}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {builtinRows.length > 0 && (
                    <>
                      <h2 className="library-group-title" style={{ marginTop: remoteRows.length > 0 ? 26 : 0 }}>
                        Koleksi bawaan
                      </h2>
                      <div className="tpl-grid">
                        {builtinRows.map((row) => (
                          <TemplateCard key={row.key} template={row} />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {sheetOpen && (
        <>
          <div className="bottom-sheet-backdrop" onClick={() => setSheetOpen(false)} aria-hidden />
          <div className="bottom-sheet" role="dialog" aria-modal="true" aria-label="Filter template">
            <div className="sheet-handle" aria-hidden />
            {filterPanel}
            <button
              type="button"
              className="btn btn-primary btn-block"
              style={{ marginTop: 18 }}
              onClick={() => setSheetOpen(false)}
            >
              Terapkan
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus template ini?"
        message={`"${deleteTarget?.title}" akan dihapus dari server bersama salinan yang dimiliki orang lain. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus template"
        onConfirm={onDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// KARTU TEMPLATE SERVER — sama gaya dengan TemplateCard, plus aksi pemilik
// ═══════════════════════════════════════════════════════════════════════════

function RemoteTemplateCard({ row, busy, onClone, onPlay, onDelete }) {
  const category = CATEGORIES.find((cat) => cat.id === row.category)
  const CatIcon = CATEGORY_ICONS[row.category] || BulbIcon

  return (
    <article className="tpl-card">
      <Link
        href={`/templates/${row.id}`}
        style={{ display: "block", textDecoration: "none" }}
        aria-label={`Lihat detail template ${row.title}`}
      >
        {row.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="tpl-cover tpl-cover-sm" src={row.coverImage} alt="" />
        ) : (
          <div className={`cat-thumb cat-${row.category}`} aria-hidden>
            <CatIcon size={36} />
          </div>
        )}
      </Link>

      <div className="tpl-card-body">
        <h3 className="tpl-title">
          <Link href={`/templates/${row.id}`} style={{ color: "inherit", textDecoration: "none" }}>
            {row.title}
          </Link>
        </h3>

        <div className="tpl-meta">
          {category ? (
            <span className="tpl-meta-item">
              <CatIcon size={14} aria-hidden />
              {category.label}
            </span>
          ) : null}
          {row.subject ? <span className="tpl-badge is-info">{row.subject}</span> : null}
          {row.visibility === "public" ? (
            <span className="tpl-badge is-success">Publik</span>
          ) : (
            <span className="tpl-badge">Privat</span>
          )}
          {row.mine && <span className="tpl-badge is-warn">Milikmu</span>}
        </div>

        <div className="tpl-meta">
          <span className="tpl-meta-item">{row.questionCount} soal</span>
          <span className="tpl-meta-dot" aria-hidden>•</span>
          <span className="tpl-meta-item">
            {row.estimatedTimeMin} menit
          </span>
          <span className="tpl-meta-dot" aria-hidden>•</span>
          <span className="tpl-meta-item">{row.usageCount}× disalin</span>
        </div>

        {row.tags.length > 0 && (
          <div className="tpl-tagrow">
            {row.tags.slice(0, 4).map((tag) => (
              <span className="tag-chip is-mini" key={tag}>#{tag}</span>
            ))}
          </div>
        )}

        <div className="tpl-meta">
          <span className="tpl-meta-item">{row.author}</span>
        </div>

        <div className="tpl-actions">
          <Link href={`/templates/${row.id}`} className="btn btn-sm btn-ghost">Preview</Link>
          <button type="button" className="btn btn-sm" disabled={busy} onClick={onClone}>
            <CopyIcon size={15} aria-hidden />
            Kloning
          </button>
          {row.mine && (
            <>
              <Link href={`/editor/new?template=${row.id}`} className="btn btn-sm">Edit</Link>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={busy}
                aria-label={`Hapus template ${row.title}`}
                onClick={onDelete}
              >
                <TrashIcon size={15} aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            style={{ flex: 1 }}
            disabled={busy}
            onClick={onPlay}
          >
            {busy && <span className="spinner" aria-hidden />}
            {!busy && <PlayIcon size={15} aria-hidden />}
            Pakai
          </button>
        </div>
      </div>
    </article>
  )
}
