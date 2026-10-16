"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { EmptyState } from "@/components/EmptyState"
import { ErrorState, LoadingState } from "@/components/AsyncState"
import { Modal } from "@/components/Modal"
import { StatTile } from "@/components/StatTile"
import {
  KELAS_OPTIONS,
  PIN_LENGTH,
  ROLES,
  ROLE_MAP,
  createAccount,
  deleteAccount,
  fetchAccounts,
  useAuth,
} from "@/lib/auth-store"
import { storageUsage } from "@/lib/quiz-storage"
import { deleteJson, getJson } from "@/lib/room-client"
import { toast } from "@/lib/toast-store"

// ═══════════════════════════════════════════════════════════════════════════
// PANEL ADMIN — /admin  (CONTRACT §3)
//   • Ringkasan: jumlah akun (server), draft lokal, template server, ukuran data
//   • Daftar akun dari server (GET /api/auth/accounts, khusus admin)
//   • Hapus akun (DELETE /api/auth/accounts/[id]) + konfirmasi
//
// Peran admin SUNGGUHAN di sini: server menolak endpoint ini untuk peran lain
// (403), jadi menyembunyikan UI bukan satu-satunya pertahanan. Yang TIDAK bisa
// dilihat admin: hash PIN (User tidak pernah memuatnya).
// ═══════════════════════════════════════════════════════════════════════════

export default function AdminClient() {
  const { user, loaded } = useAuth()
  const [accounts, setAccounts] = useState(null) // null = belum dimuat
  const [loadError, setLoadError] = useState("")
  const [templates, setTemplates] = useState(null)
  const [templateError, setTemplateError] = useState("")
  const [usage, setUsage] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmTemplate, setConfirmTemplate] = useState(null)
  const [busyId, setBusyId] = useState("")
  const [query, setQuery] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState({ name: "", pin: "", role: "guru", kelas: "7A" })
  const [creating, setCreating] = useState(false)

  const isAdmin = Boolean(user && user.role === "admin")

  const loadAccounts = useCallback(async () => {
    const result = await fetchAccounts()
    if (!result.ok) {
      setAccounts([])
      setLoadError(result.error)
      return
    }
    setAccounts(result.accounts)
    setLoadError("")
  }, [])

  const loadTemplates = useCallback(async () => {
    // `all=1` = moderasi: admin melihat SEMUA template dari semua akun
    // (termasuk privat). Server menolak 403 untuk peran selain admin.
    const result = await getJson("/api/templates?all=1")
    if (!result.ok) {
      setTemplates([])
      setTemplateError(result.error)
      return
    }
    setTemplates(Array.isArray(result.data?.templates) ? result.data.templates : [])
    setTemplateError("")
  }, [])

  // Muat hanya setelah login sebagai admin (localStorage & API sama-sama
  // dibaca di effect supaya hydration aman).
  useEffect(() => {
    if (!loaded || !isAdmin) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sinkron dari storage & API (external)
    setUsage(storageUsage())
    loadAccounts()
    loadTemplates()
  }, [loaded, isAdmin, loadAccounts, loadTemplates])

  const filtered = useMemo(() => {
    if (!accounts) return []
    const keyword = query.trim().toLowerCase()
    if (!keyword) return accounts
    return accounts.filter(
      (account) =>
        account.name.toLowerCase().includes(keyword) ||
        (ROLE_MAP[account.role]?.label || account.role).toLowerCase().includes(keyword) ||
        String(account.kelas || "").toLowerCase().includes(keyword)
    )
  }, [accounts, query])

  const roleCounts = useMemo(() => {
    const counts = { guru: 0, siswa: 0, admin: 0 }
    for (const account of accounts ?? []) {
      if (counts[account.role] !== undefined) counts[account.role] += 1
    }
    return counts
  }, [accounts])

  const onDelete = useCallback(
    async (account) => {
      if (busyId) return
      setBusyId(account.id)
      const result = await deleteAccount(account.id)
      setBusyId("")
      setConfirmDelete(null)

      if (!result.ok) {
        toast.error("Gagal menghapus akun", result.error)
        return
      }
      toast.success("Akun dihapus", `${account.name} tidak bisa masuk lagi.`)
      loadAccounts()
    },
    [busyId, loadAccounts]
  )

  const onDeleteTemplate = useCallback(async () => {
    const row = confirmTemplate
    if (!row) return
    setBusyId(`tpl-${row.id}`)
    const result = await deleteJson(`/api/templates/${row.id}`)
    setBusyId("")
    setConfirmTemplate(null)
    if (!result.ok) {
      toast.error("Gagal menghapus template", result.error)
      return
    }
    toast.success("Template dihapus", row.title)
    loadTemplates()
  }, [confirmTemplate, loadTemplates])

  const createValid =
    createForm.name.trim().length >= 2 &&
    createForm.name.trim().length <= 20 &&
    createForm.pin.length === PIN_LENGTH &&
    (createForm.role !== "siswa" || Boolean(createForm.kelas))

  const onCreate = useCallback(async () => {
    if (creating || !createValid) return
    setCreating(true)
    const result = await createAccount({
      name: createForm.name,
      pin: createForm.pin,
      role: createForm.role,
      kelas: createForm.role === "siswa" ? createForm.kelas : null,
    })
    setCreating(false)
    if (!result.ok) {
      toast.error("Gagal membuat akun", result.error)
      return
    }
    toast.success("Akun dibuat", `${result.user.name} bisa masuk sekarang.`)
    setCreateOpen(false)
    setCreateForm({ name: "", pin: "", role: "guru", kelas: "7A" })
    loadAccounts()
  }, [creating, createForm, createValid, loadAccounts])

  if (!loaded) {
    return <LoadingState label="Memuat…" marginTop={60} />
  }

  if (!isAdmin) {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
        </div>
        <div className="card center" style={{ marginTop: 48 }}>
          <p style={{ fontSize: 40, margin: 0 }} aria-hidden>🔒</p>
          <h1 className="card-title" style={{ marginTop: 14 }}>Khusus admin</h1>
          <p className="card-hint" style={{ marginBottom: 22 }}>
            {user
              ? `Akunmu (${user.name}) berperan sebagai ${ROLE_MAP[user.role]?.label || user.role}. Panel ini hanya untuk peran admin.`
              : "Masuk dengan akun berperan admin untuk membuka panel ini."}
          </p>
          <div className="btn-row" style={{ justifyContent: "center" }}>
            <Link href="/masuk" className="btn btn-primary">{user ? "Ganti akun" : "Masuk"}</Link>
            <Link href="/" className="btn">Ke halaman utama</Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="page" style={{ maxWidth: 1000 }}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <h1 className="page-title" style={{ fontSize: "clamp(26px, 5vw, 36px)", margin: 0 }}>
          Panel Admin
        </h1>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setCreateOpen(true)}
          >
            + Buat akun
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => { loadAccounts(); loadTemplates(); setUsage(storageUsage()) }}
          >
            ⟳ Muat ulang
          </button>
          <Link href="/masuk" className="btn btn-sm btn-ghost">Profil</Link>
        </div>
      </div>

      <div className="metrics-grid" style={{ marginTop: 22 }}>
        <StatTile value={accounts?.length ?? "—"} label="Akun di server" />
        <StatTile value={templates?.length ?? "—"} label="Template milikmu" />
        <StatTile value={usage?.quizCount ?? 0} label="Draft lokal (perangkat ini)" />
        <StatTile
          value={usage ? `${Math.round(usage.bytes / 1024)} KB` : "—"}
          label="Ukuran draft lokal"
        />
      </div>

      <div className="metrics-grid" style={{ marginTop: 14 }}>
        <StatTile value={roleCounts.guru} label="Guru" />
        <StatTile value={roleCounts.siswa} label="Siswa" />
        <StatTile value={roleCounts.admin} label="Admin" />
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Daftar akun</h2>
          <input
            type="search"
            className="search-input"
            style={{ maxWidth: 260, padding: "10px 14px", fontSize: 14 }}
            placeholder="🔍  Cari nama / peran / kelas…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari akun"
          />
        </div>

        {loadError && <ErrorState message={loadError} onRetry={loadAccounts} marginTop={14} />}

        {accounts === null ? (
          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <div className="skeleton" style={{ height: 54 }} />
            <div className="skeleton" style={{ height: 54 }} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Tidak ada akun cocok"
            description="Coba kata kunci lain, atau kosongkan pencarian."
          />
        ) : (
          <ul className="leaderboard" style={{ marginTop: 14 }}>
            {filtered.map((account) => {
              const isSelf = String(account.id) === String(user.id)
              return (
                <li key={account.id}>
                  <span
                    className="player-avatar"
                    style={{ width: 32, height: 32, borderRadius: 10, fontSize: 14 }}
                    aria-hidden
                  >
                    {account.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="leaderboard-name" title={account.name}>
                    {account.name}
                    {isSelf ? " (kamu)" : ""}
                  </span>
                  <span className="leaderboard-meta">
                    <span className="tpl-badge">
                      {ROLE_MAP[account.role]?.label || account.role}
                    </span>
                    {account.kelas && <span className="pct-big">{account.kelas}</span>}
                    <span className="pct-big" style={{ fontSize: 12.5 }}>
                      {account.createdAt
                        ? new Date(account.createdAt).toLocaleDateString("id-ID")
                        : "—"}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      disabled={isSelf || busyId === account.id}
                      title={isSelf ? "Tidak bisa menghapus akun yang sedang aktif" : "Hapus akun"}
                      aria-label={`Hapus akun ${account.name}`}
                      onClick={() => setConfirmDelete(account)}
                    >
                      🗑
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}

        <p className="footer-note" style={{ marginTop: 18 }}>
          Data akun ada di server (<span className="mono">data/quiz.db</span>). PIN disimpan
          sebagai hash scrypt dan TIDAK PERNAH dikirim ke panel ini. Menghapus akun
          juga menghapus template miliknya (relasi <span className="mono">ON DELETE CASCADE</span>).
        </p>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
          <h2 className="card-title" style={{ margin: 0 }}>Moderasi template</h2>
          <span className="stat-label">{templates?.length ?? "—"} template di server</span>
        </div>
        <p className="card-hint">
          Semua template dari seluruh akun (termasuk privat). Gunakan ini untuk
          meninjau konten; hapus hanya jika melanggar.
        </p>
        {templateError ? (
          <div className="alert alert-error" role="alert">{templateError}</div>
        ) : templates === null ? (
          <div className="skeleton" style={{ height: 54 }} />
        ) : templates.length === 0 ? (
          <p className="card-hint">Belum ada template di server.</p>
        ) : (
          <ul className="leaderboard" style={{ marginTop: 10 }}>
            {templates.map((row) => (
              <li key={row.id}>
                <span className="leaderboard-name" title={row.title}>{row.title}</span>
                <span className="leaderboard-meta">
                  <span className="pct-big">{row.ownerName ?? "—"}</span>
                  <span className="tpl-badge">
                    {row.visibility === "public" ? "Publik" : "Privat"}
                  </span>
                  <span className="pct-big">
                    {Array.isArray(row.questions) ? row.questions.length : 0} soal
                  </span>
                  <span className="pct-big">⧉ {Number(row.cloneCount ?? 0)}×</span>
                  <Link href={`/templates/${row.id}`} className="btn btn-sm btn-ghost">Buka</Link>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    disabled={busyId === `tpl-${row.id}`}
                    aria-label={`Hapus template ${row.title}`}
                    title="Hapus template ini"
                    onClick={() => setConfirmTemplate(row)}
                  >
                    🗑
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Hapus akun ini?"
        message={`"${confirmDelete?.name}" tidak akan bisa masuk lagi. Template miliknya di server ikut terhapus; draft lokal di browser ini tidak tersentuh.`}
        confirmLabel="Hapus akun"
        onConfirm={() => onDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Buat akun baru" maxWidth={460}>
        <p className="card-hint" style={{ marginBottom: 16 }}>
          Akun yang dibuat di sini bisa berperan <strong>guru</strong>, <strong>siswa</strong>,
          atau <strong>admin</strong>. Admin baru hanya bisa dibuat dari panel ini.
        </p>

        <label className="field">
          <span className="label">Nama</span>
          <input
            type="text"
            className="input"
            maxLength={20}
            value={createForm.name}
            onChange={(event) => setCreateForm((f) => ({ ...f, name: event.target.value }))}
            placeholder="Nama akun"
          />
        </label>

        <label className="field">
          <span className="label">PIN ({PIN_LENGTH} digit)</span>
          <input
            type="text"
            inputMode="numeric"
            className="input"
            maxLength={PIN_LENGTH}
            value={createForm.pin}
            onChange={(event) =>
              setCreateForm((f) => ({ ...f, pin: event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH) }))
            }
            placeholder="123456"
          />
        </label>

        <label className="field">
          <span className="label">Peran</span>
          <select
            className="select"
            value={createForm.role}
            onChange={(event) => setCreateForm((f) => ({ ...f, role: event.target.value }))}
          >
            {ROLES.map((role) => (
              <option key={role.id} value={role.id}>{role.label}</option>
            ))}
          </select>
        </label>

        {createForm.role === "siswa" && (
          <label className="field">
            <span className="label">Kelas</span>
            <select
              className="select"
              value={createForm.kelas}
              onChange={(event) => setCreateForm((f) => ({ ...f, kelas: event.target.value }))}
            >
              {KELAS_OPTIONS.map((option) => (
                <option key={option} value={option}>Kelas {option}</option>
              ))}
            </select>
          </label>
        )}

        <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
          <button type="button" className="btn" onClick={() => setCreateOpen(false)}>Batal</button>
          <button type="button" className="btn btn-primary" disabled={creating || !createValid} onClick={onCreate}>
            {creating && <span className="spinner" aria-hidden />}
            Buat akun
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmTemplate !== null}
        title="Hapus template ini?"
        message={`"${confirmTemplate?.title ?? ""}" (milik ${confirmTemplate?.ownerName ?? "?"}) akan dihapus dari server. Tindakan ini tidak bisa dibatalkan.`}
        confirmLabel="Hapus template"
        onConfirm={onDeleteTemplate}
        onCancel={() => setConfirmTemplate(null)}
      />
    </main>
  )
}
