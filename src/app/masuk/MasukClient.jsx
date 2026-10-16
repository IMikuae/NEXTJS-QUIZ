"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DEMO_ACCOUNT_NAMES,
  DEMO_PIN_HINT,
  KELAS_OPTIONS,
  NAME_MAX_LEN,
  PIN_LENGTH,
  PUBLIC_ROLES,
  ROLE_MAP,
  accountCount,
  changePin,
  login,
  logout,
  register,
  updateProfile,
  useAuth,
} from "@/lib/auth-store"
import { claimGuestData, storageUsage } from "@/lib/quiz-storage"
import { toast } from "@/lib/toast-store"
import { ArrowLeftIcon, EyeIcon, EyeOffIcon } from "@/components/HomeIcons"

// ═══════════════════════════════════════════════════════════════════════════
// MASUK / DAFTAR — /masuk
//   • Dua tab: Masuk · Daftar
//   • Pilih peran: Guru / Siswa (admin tidak bisa mendaftar sendiri)
//   • PIN 6 digit (input angka, ada tombol mata untuk lihat)
//   • Petunjuk akun demo (PIN 123456) — hanya bila belum ada akun sama sekali
//   • Sudah login → kartu profil + ganti nama + ganti PIN + keluar
//
// SEJAK v2 akun ada di SERVER (CONTRACT §3): PIN dikirim ke /api/auth/login dan
// diverifikasi di sana (scrypt + cookie httpOnly). Tidak ada hashing di klien
// dan tidak ada akun yang ditulis ke localStorage. Pesan galat server
// ("Nama atau PIN tidak cocok.") ditampilkan APA ADANYA.
//
// Data "tamu" (kuis yang dibuat sebelum punya akun) tetap dipindahkan ke akun
// begitu login/daftar berhasil.
// ═══════════════════════════════════════════════════════════════════════════

export default function MasukClient() {
  const router = useRouter()
  const { user, loaded } = useAuth()

  const [mode, setMode] = useState("login") // login | register
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [pinConfirm, setPinConfirm] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [role, setRole] = useState("guru")
  const [kelas, setKelas] = useState(KELAS_OPTIONS[0])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const afterAuth = useCallback(
    (label, loggedInUser) => {
      const claimed = claimGuestData()
      toast.success(
        label,
        claimed.moved > 0 ? `${claimed.moved} kuis dipindahkan ke akunmu.` : undefined
      )
      router.push(loggedInUser?.role === "admin" ? "/admin" : "/my-quizzes")
    },
    [router]
  )

  const onSubmit = useCallback(
    async (event) => {
      event.preventDefault()
      if (busy) return
      setError("")

      if (name.trim().length === 0) {
        setError("Isi nama akunmu dulu.")
        return
      }
      if (pin.length !== PIN_LENGTH) {
        setError(`PIN harus ${PIN_LENGTH} digit angka.`)
        return
      }
      if (mode === "register" && pin !== pinConfirm) {
        setError("Konfirmasi PIN tidak cocok.")
        return
      }

      setBusy(true)
      const result =
        mode === "register"
          ? await register({ name, pin, role, kelas })
          : await login({ name, pin })
      setBusy(false)

      if (!result.ok) {
        setError(result.error)
        return
      }
      afterAuth(mode === "register" ? "Akun dibuat" : `Halo, ${result.user.name}!`, result.user)
    },
    [busy, mode, name, pin, pinConfirm, role, kelas, afterAuth]
  )

  /** Isi cepat form login dengan salah satu akun demo (PIN 123456). */
  const fillDemo = useCallback((demoName) => {
    setMode("login")
    setName(demoName)
    setPin(DEMO_PIN_HINT)
    setPinConfirm("")
    setError("")
  }, [])

  // ═══ Sudah login ═══
  if (loaded && user) {
    return <ProfileCard user={user} />
  }

  // Petunjuk akun demo hanya ditampilkan selama jumlah akun yang diketahui
  // MASIH 0 — artinya server baru dipasang atau daftar akun belum pernah
  // terbaca (hanya admin yang boleh membacanya). Begitu admin melihat ada
  // akun sungguhan, tawaran akun demo ini hilang sendiri.
  const showDemoTools = accountCount() === 0

  // ═══ Belum login: form ═══
  return (
    <main className="page page-narrow">
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="card glass-card" style={{ marginTop: 30 }}>
        <h1 className="card-title">
          {mode === "register" ? "Buat akun Yue Quiz" : "Masuk ke Yue Quiz"}
        </h1>
        <p className="card-hint">
          {mode === "register"
            ? "Pilih peran, isi nama, dan tentukan PIN 6 digit. Tanpa email."
            : "Masukkan nama dan PIN 6 digit akunmu."}
        </p>

        <div className="tab-row" role="tablist" style={{ marginTop: 6 }}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`tab${mode === "login" ? " is-active" : ""}`}
            onClick={() => { setMode("login"); setError("") }}
          >
            Masuk
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`tab${mode === "register" ? " is-active" : ""}`}
            onClick={() => { setMode("register"); setError("") }}
          >
            Daftar
          </button>
        </div>

        {error && (
          <div className="alert alert-error" role="alert" aria-live="polite">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          {/* ── Peran (hanya saat daftar) ── */}
          {mode === "register" && (
            <>
              <span className="label">Daftar sebagai</span>
              <div className="choice-grid" style={{ marginBottom: 16 }}>
                {PUBLIC_ROLES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`choice-card${role === item.id ? " is-selected" : ""}`}
                    aria-pressed={role === item.id}
                    onClick={() => setRole(item.id)}
                  >
                    <span className="choice-title">{item.label}</span>
                    <span className="choice-desc">{item.desc}</span>
                  </button>
                ))}
              </div>

              {role === "siswa" && (
                <label className="field">
                  <span className="label">Kelas</span>
                  <select
                    className="select"
                    value={kelas}
                    disabled={busy}
                    onChange={(event) => setKelas(event.target.value)}
                  >
                    {KELAS_OPTIONS.map((option) => (
                      <option key={option} value={option}>Kelas {option}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}

          <label className="field">
            <span className="label">Nama akun</span>
            <input
              type="text"
              className="input"
              value={name}
              maxLength={NAME_MAX_LEN}
              autoComplete="username"
              disabled={busy}
              placeholder={mode === "register" ? "Mis. Bu Rina" : "Nama akunmu"}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="label">PIN ({PIN_LENGTH} digit angka)</span>
            <div style={{ position: "relative" }}>
              <input
                type={showPin ? "text" : "password"}
                className="input input-pin"
                value={pin}
                inputMode="numeric"
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                disabled={busy}
                placeholder={"•".repeat(PIN_LENGTH)}
                onChange={(event) =>
                  setPin(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
                }
              />
              <button
                type="button"
                className="pin-toggle"
                aria-label={showPin ? "Sembunyikan PIN" : "Tampilkan PIN"}
                onClick={() => setShowPin((prev) => !prev)}
              >
                {showPin ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </label>

          {mode === "register" && (
            <label className="field">
              <span className="label">Ulangi PIN</span>
              <input
                type={showPin ? "text" : "password"}
                className="input input-pin"
                value={pinConfirm}
                inputMode="numeric"
                autoComplete="new-password"
                disabled={busy}
                placeholder={"•".repeat(PIN_LENGTH)}
                onChange={(event) =>
                  setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
                }
              />
            </label>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Memproses…" : mode === "register" ? "Buat akun & masuk" : "Masuk"}
          </button>
        </form>

        {/* ── Akun demo ── */}
        {showDemoTools && (
          <div style={{ marginTop: 22 }}>
            <h3 className="filter-group-title">Akun demo (PIN {DEMO_PIN_HINT})</h3>
            <div className="chip-row">
              {DEMO_ACCOUNT_NAMES.map((demoName) => (
                <button
                  key={demoName}
                  type="button"
                  className="chip"
                  disabled={busy}
                  onClick={() => fillDemo(demoName)}
                >
                  {demoName}
                </button>
              ))}
            </div>
            <p className="footer-note" style={{ textAlign: "left", marginTop: 10 }}>
              Peran akun demo: Admin Yue = admin · Bu Rina = guru · Budi/Sari = siswa (kelas 7A).
              Akun demo dibuat server saat database masih kosong — kalau server sudah
              punya akun lain, daftar ini otomatis disembunyikan.
            </p>
          </div>
        )}

        <p className="footer-note" style={{ marginTop: 18, textAlign: "left" }}>
          <strong>Catatan:</strong> akun Yue Quiz tersimpan di server. PIN dikirim
          lewat HTTPS ke <span className="mono">/api/auth/login</span>, diverifikasi
          dengan scrypt di sana, dan sesi disimpan pada cookie httpOnly yang tidak
          bisa dibaca JavaScript. Kamu tetap bisa bermain tanpa akun.
        </p>

        <div className="btn-row" style={{ marginTop: 10 }}>
          <Link href="/" className="btn btn-sm btn-ghost"><ArrowLeftIcon size={16} aria-hidden /> Lanjut tanpa akun</Link>
        </div>
      </div>
    </main>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// KARTU PROFIL — ringkasan akun + sunting nama + ganti PIN + keluar
// ═══════════════════════════════════════════════════════════════════════════

function ProfileCard({ user }) {
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(user.name)
  const [pinOpen, setPinOpen] = useState(false)
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const usage = storageUsage()
  const roleInfo = ROLE_MAP[user.role]
  const initials = user.name.charAt(0).toUpperCase()

  const onSaveName = async () => {
    if (busy) return
    setBusy(true)
    setError("")
    const result = await updateProfile(draftName)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success("Nama diperbarui", result.user.name)
    setEditingName(false)
  }

  const onSavePin = async () => {
    if (busy) return
    setError("")
    if (newPin !== confirmPin) {
      setError("Konfirmasi PIN baru tidak cocok.")
      return
    }

    setBusy(true)
    const result = await changePin(currentPin, newPin)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success("PIN diganti", "Pakai PIN baru saat masuk berikutnya.")
    setPinOpen(false)
    setCurrentPin("")
    setNewPin("")
    setConfirmPin("")
  }

  const onLogout = async () => {
    if (busy) return
    setBusy(true)
    await logout()
    setBusy(false)
    toast.info("Kamu sudah keluar", "Sampai jumpa lagi!")
  }

  const digitsOnly = (value) => value.replace(/\D/g, "").slice(0, PIN_LENGTH)

  return (
    <main className="page page-narrow">
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="card glass-card center" style={{ marginTop: 30 }}>
        <div
          className="player-avatar"
          style={{ width: 62, height: 62, borderRadius: 18, fontSize: 26, margin: "0 auto" }}
          aria-hidden
        >
          {initials}
        </div>
        <h1 className="card-title" style={{ marginTop: 16 }}>{user.name}</h1>
        <p className="card-hint">
          <span className="tpl-badge">{roleInfo?.label || user.role}</span>
          {user.kelas ? ` · Kelas ${user.kelas}` : ""}
          {user.createdAt
            ? ` · dibuat ${new Date(user.createdAt).toLocaleDateString("id-ID")}`
            : ""}
        </p>

        {usage && (
          <div className="metrics-grid" style={{ marginTop: 8 }}>
            <div className="stat-card">
              <span className="stat-value">{usage.quizCount}</span>
              <span className="stat-label">Kuis tersimpan</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{usage.templateCount}</span>
              <span className="stat-label">Template lokal</span>
            </div>
          </div>
        )}

        {error && (
          <div className="alert alert-error" role="alert" style={{ textAlign: "left" }}>
            {error}
          </div>
        )}

        <div className="btn-row" style={{ justifyContent: "center", marginTop: 18 }}>
          {user.role === "admin" ? (
            <Link href="/admin" className="btn btn-primary">Panel Admin</Link>
          ) : (
            <Link href="/my-quizzes" className="btn btn-primary">Kuis Saya</Link>
          )}
          <Link href="/editor/new" className="btn">Buat Quiz</Link>
          <Link href="/" className="btn btn-ghost">Beranda</Link>
        </div>

        <div className="btn-row" style={{ justifyContent: "center", marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setEditingName((prev) => !prev); setDraftName(user.name); setError("") }}
          >
            {editingName ? "Batal" : "Ganti nama"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => { setPinOpen((prev) => !prev); setError("") }}
          >
            {pinOpen ? "Batal" : "Ganti PIN"}
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={onLogout}>
            {busy && <span className="spinner" aria-hidden />}
            Keluar
          </button>
        </div>
      </div>

      {editingName && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 className="card-title">Ganti nama tampilan</h2>
          <p className="card-hint">Nama harus unik di server (tanpa peduli huruf besar/kecil).</p>
          <label className="field">
            <span className="label">Nama baru</span>
            <input
              type="text"
              className="input"
              value={draftName}
              maxLength={NAME_MAX_LEN}
              disabled={busy}
              onChange={(event) => setDraftName(event.target.value)}
            />
          </label>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onSaveName}>
              {busy && <span className="spinner" aria-hidden />}
              Simpan nama
            </button>
          </div>
        </div>
      )}

      {pinOpen && (
        <div className="card" style={{ marginTop: 18 }}>
          <h2 className="card-title">Ganti PIN</h2>
          <p className="card-hint">
            PIN lama wajib diisi. PIN baru harus 6 digit dan berbeda dari yang lama.
          </p>

          <label className="field">
            <span className="label">PIN lama</span>
            <input
              type={showPin ? "text" : "password"}
              className="input input-pin"
              value={currentPin}
              inputMode="numeric"
              autoComplete="current-password"
              disabled={busy}
              placeholder={"•".repeat(PIN_LENGTH)}
              onChange={(event) => setCurrentPin(digitsOnly(event.target.value))}
            />
          </label>

          <label className="field">
            <span className="label">PIN baru</span>
            <input
              type={showPin ? "text" : "password"}
              className="input input-pin"
              value={newPin}
              inputMode="numeric"
              autoComplete="new-password"
              disabled={busy}
              placeholder={"•".repeat(PIN_LENGTH)}
              onChange={(event) => setNewPin(digitsOnly(event.target.value))}
            />
          </label>

          <label className="field">
            <span className="label">Ulangi PIN baru</span>
            <input
              type={showPin ? "text" : "password"}
              className="input input-pin"
              value={confirmPin}
              inputMode="numeric"
              autoComplete="new-password"
              disabled={busy}
              placeholder={"•".repeat(PIN_LENGTH)}
              onChange={(event) => setConfirmPin(digitsOnly(event.target.value))}
            />
          </label>

          <label className="field" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={showPin}
              onChange={(event) => setShowPin(event.target.checked)}
            />
            <span className="label" style={{ margin: 0 }}>Tampilkan PIN</span>
          </label>

          <div className="btn-row">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onSavePin}>
              {busy && <span className="spinner" aria-hidden />}
              Simpan PIN
            </button>
          </div>
        </div>
      )}

      <p className="footer-note" style={{ marginTop: 18, textAlign: "center" }}>
        Sesi disimpan di cookie httpOnly <span className="mono">yq_session</span> dan
        berlaku 30 hari. Kuis yang dibuat tanpa akun tetap tersimpan di ruang
        &ldquo;tamu&rdquo; perangkat ini.
      </p>
    </main>
  )
}
