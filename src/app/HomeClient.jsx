"use client"

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CodeInput } from "@/components/CodeInput"
import { CreateChoiceModal } from "@/components/CreateChoiceModal"
import { TemplateCard } from "@/components/TemplateCard"
import {
  ArrowRightIcon,
  BoltIcon,
  BookIcon,
  ChartIcon,
  FileIcon,
  PlusIcon,
  SparkIcon,
  UsersIcon,
} from "@/components/HomeIcons"
import { TEMPLATE_INDEX } from "@/lib/templates-data"
import { normalizeCodeInput, postJson, savePlayer } from "@/lib/room-client"

// ═══════════════════════════════════════════════════════════════════════════
// BERANDA YUE QUIZ — tiga entry point yang jelas:
//   1. Buat Quiz   → CreateChoiceModal (dari nol / template / import)
//   2. Template    → /templates
//   3. Gabung Quiz → kode 6 kotak + nama
// Visual: hero dengan pratinjau kartu soal (interaktif, bukan dekorasi
// statis), ikon SVG inline (tanpa bergantung pada font emoji).
// ═══════════════════════════════════════════════════════════════════════════

const STEPS = [
  { icon: PlusIcon, title: "Buat atau pilih quiz", text: "Tulis soal sendiri, pakai template, atau impor dari teks." },
  { icon: UsersIcon, title: "Bagikan kode 6 huruf", text: "Pemain masuk lewat kode atau scan QR, tanpa akun." },
  { icon: ChartIcon, title: "Main serempak, lihat skor", text: "Papan skor dan analitik per soal langsung tersedia." },
]

const WHY = [
  { icon: BoltIcon, title: "Tanpa akun untuk bermain", text: "Pemain cukup memasukkan kode 6 huruf. Tidak perlu email, tidak perlu memasang aplikasi." },
  { icon: SparkIcon, title: "Dua mode sekaligus", text: "Main serempak seperti kuis kelas, atau mode ujian mandiri dengan nilai dan pembahasan per soal." },
  { icon: ChartIcon, title: "Analitik nyata", text: "Akurasi per soal, papan skor, dan riwayat sesi tersimpan untuk ditinjau ulang." },
]

// Pratinjau soal statis untuk hero. Hanya dekorasi: tidak menyimpan jawaban
// dan tidak dikirim ke server.
const PREVIEW_OPTIONS = ["Jakarta", "Bandung", "Surabaya", "Medan"]

export default function HomeClient() {
  const router = useRouter()

  const [modalOpen, setModalOpen] = useState(false)
  const [joinCode, setJoinCode] = useState("")
  const [joinName, setJoinName] = useState("")
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState("")
  const [previewPick, setPreviewPick] = useState(null)

  const onJoin = useCallback(
    async (event) => {
      event.preventDefault()
      if (joining) return

      const code = normalizeCodeInput(joinCode)
      const name = joinName.trim()

      if (code.length !== 6) {
        setJoinError("Kode room harus 6 huruf.")
        return
      }
      if (name.length === 0) {
        setJoinError("Nama tidak boleh kosong.")
        return
      }
      if (name.length > 20) {
        setJoinError("Nama maksimal 20 karakter.")
        return
      }

      setJoinError("")
      setJoining(true)

      const result = await postJson(`/api/rooms/${code}/join`, { name })
      setJoining(false)

      if (!result.ok) {
        // Server sudah mengirim pesan spesifik: "Kuis sudah dimulai." atau
        // "Nama itu sudah dipakai di room ini."
        setJoinError(result.error || "Gagal bergabung. Coba lagi.")
        return
      }

      const { playerId, token } = result.data || {}
      if (!playerId || !token) {
        setJoinError("Server tidak mengirim identitas pemain. Coba lagi.")
        return
      }

      savePlayer(code, playerId, token, name)
      router.push(`/play/${code}`)
    },
    [joining, joinCode, joinName, router]
  )

  const featured = TEMPLATE_INDEX.filter((t) => t.featured).slice(0, 4)
  const quizCount = TEMPLATE_INDEX.length

  return (
    <main className="page home" style={{ maxWidth: 1120 }}>
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
        <div className="glow-blob glow-cyan" />
      </div>

      {/* ═══ HERO ═══════════════════════════════════════════════════════ */}
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="hero-eyebrow">
            <span className="brand-dot" aria-hidden /> Live quiz untuk kelas &amp; komunitas
          </span>

          <h1 className="home-title">
            Quiz yang <span className="home-title-accent">bikin ramai</span> kelasmu.
          </h1>
          <p className="home-lede">
            Buat quiz dalam hitungan detik, bagikan kode 6 huruf, dan lihat siapa
            paling cepat menjawab. Tanpa akun untuk pemain.
          </p>

          <div className="home-actions">
            <button
              type="button"
              className="btn btn-primary btn-lg btn-glow"
              onClick={() => setModalOpen(true)}
            >
              <PlusIcon size={18} /> Buat Quiz
            </button>
            <Link href="/templates" className="btn btn-ghost btn-lg">
              <BookIcon size={18} /> Jelajahi Template
            </Link>
          </div>
        </div>

        {/* Pratinjau kartu soal: interaktif ringan, tanpa efek berat. */}
        <div className="home-preview" aria-label="Contoh tampilan soal">
          <div className="home-preview-card">
            <div className="home-preview-top">
              <span className="home-chip">Soal 3 / 10</span>
              <span className="home-timer" aria-label="Sisa waktu 15 detik">15</span>
            </div>
            <p className="home-preview-q">Apa ibu kota Jawa Timur?</p>
            <div className="home-preview-opts">
              {PREVIEW_OPTIONS.map((option, index) => {
                const picked = previewPick === index
                return (
                  <button
                    key={option}
                    type="button"
                    className={`home-opt${picked ? " is-picked" : ""}`}
                    aria-pressed={picked}
                    onClick={() => setPreviewPick(index)}
                  >
                    <span className="home-opt-letter">{"ABCD"[index]}</span>
                    {option}
                  </button>
                )
              })}
            </div>
            <p className="home-preview-hint">
              {previewPick === null
                ? "Coba pilih satu jawaban."
                : previewPick === 2
                  ? "Tepat! Surabaya ibu kotanya."
                  : "Hampir. Coba lagi, ini cuma contoh."}
            </p>
          </div>
        </div>
      </section>

      {/* ═══ CARA KERJA ═════════════════════════════════════════════════ */}
      <section className="home-steps" aria-label="Cara kerja">
        {STEPS.map((step, index) => {
          const Icon = step.icon
          return (
            <div className="home-step" key={step.title}>
              <span className="home-step-icon">
                <Icon size={20} />
              </span>
              <span className="home-step-num">0{index + 1}</span>
              <span className="home-step-title">{step.title}</span>
              <span className="home-step-text">{step.text}</span>
            </div>
          )
        })}
      </section>

      {/* ═══ TEMPLATE UNGGULAN ═════════════════════════════════════════ */}
      {featured.length > 0 && (
        <section className="home-section">
          <div className="home-section-head">
            <h2>Template pilihan</h2>
            <Link href="/templates" className="home-more">
              Lihat semua ({quizCount}) <ArrowRightIcon size={16} />
            </Link>
          </div>
          <div className="tpl-grid">
            {featured.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        </section>
      )}

      {/* ═══ GABUNG QUIZ ════════════════════════════════════════════════ */}
      <section className="home-join-grid">
        <form className="card glass-card home-join" onSubmit={onJoin}>
          <h2 className="card-title">Gabung quiz</h2>
          <p className="card-hint">
            Minta kode 6 huruf dari host (atau scan QR di layarnya), lalu masukkan
            namamu. Tidak perlu daftar akun.
          </p>

          {joinError && (
            <div className="alert alert-error" role="alert">
              {joinError}
            </div>
          )}

          <div className="field">
            <span className="label">Kode room</span>
            <CodeInput value={joinCode} onChange={setJoinCode} disabled={joining} />
          </div>

          <label className="field">
            <span className="label">Namamu</span>
            <input
              type="text"
              className="input"
              value={joinName}
              maxLength={20}
              disabled={joining}
              placeholder="Mis. Andi"
              onChange={(event) => setJoinName(event.target.value)}
            />
          </label>

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={joining}>
            {joining && <span className="spinner" aria-hidden />}
            {joining ? "Bergabung..." : "Gabung ke room"}
          </button>

          <p className="footer-note" style={{ marginTop: 16, textAlign: "left" }}>
            Kalau host sudah menekan &ldquo;Mulai Kuis&rdquo;, pemain baru tidak bisa
            masuk lagi.
          </p>
        </form>

        <div className="card glass-card home-start">
          <h2 className="card-title">Tiga cara memulai</h2>
          <p className="card-hint">
            Yue Quiz untuk membuat, menemukan, memainkan, dan menganalisis quiz.
          </p>

          <div className="home-start-list">
            <button type="button" className="home-start-item" onClick={() => setModalOpen(true)}>
              <span className="home-start-icon"><SparkIcon size={20} /></span>
              <span className="home-start-body">
                <span className="choice-title">Buat dari nol</span>
                <span className="choice-desc">Editor soal lengkap dengan preset waktu.</span>
              </span>
              <ArrowRightIcon size={18} className="home-start-arrow" />
            </button>

            <Link href="/templates" className="home-start-item">
              <span className="home-start-icon"><BookIcon size={20} /></span>
              <span className="home-start-body">
                <span className="choice-title">Gunakan template</span>
                <span className="choice-desc">{quizCount} template siap pakai, tinggal edit.</span>
              </span>
              <ArrowRightIcon size={18} className="home-start-arrow" />
            </Link>

            <Link href="/editor/new?mode=import" className="home-start-item">
              <span className="home-start-icon"><FileIcon size={20} /></span>
              <span className="home-start-body">
                <span className="choice-title">Import quiz</span>
                <span className="choice-desc">Tempel daftar soal dari teks, selesai.</span>
              </span>
              <ArrowRightIcon size={18} className="home-start-arrow" />
            </Link>
          </div>

          <p className="footer-note" style={{ marginTop: 18, textAlign: "left" }}>
            Skor dihitung otomatis: 1.000 poin dasar + bonus kecepatan. Jawaban
            benar selalu bernilai 1.000–2.000 poin.
          </p>
        </div>
      </section>

      {/* ═══ KEUNGGULAN ════════════════════════════════════════════════ */}
      <section className="home-section">
        <div className="home-section-head">
          <h2>Kenapa Yue Quiz?</h2>
        </div>
        <div className="home-why">
          {WHY.map((item) => {
            const Icon = item.icon
            return (
              <div className="home-why-card" key={item.title}>
                <span className="home-why-icon"><Icon size={22} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ═══ FAQ ════════════════════════════════════════════════════════ */}
      <section className="home-section">
        <div className="home-section-head">
          <h2>Pertanyaan umum</h2>
        </div>
        <div className="faq-list">
          <details className="faq-item">
            <summary>Apakah pemain harus punya akun?</summary>
            <p>
              Tidak. Pemain cukup memasukkan kode 6 huruf dan nama. Akun hanya
              diperlukan untuk menyimpan template, riwayat, dan hasil.
            </p>
          </details>
          <details className="faq-item">
            <summary>Apa beda mode Live dan Ujian?</summary>
            <p>
              Mode Live berjalan serempak: satu soal untuk semua, host yang
              mengendalikan, lalu jawaban dibahas bersama. Mode Ujian berjalan
              mandiri: tiap pemain punya jamnya sendiri dan mendapat nilai akhir.
            </p>
          </details>
          <details className="faq-item">
            <summary>Bisakah memakai gambar dan notasi matematika?</summary>
            <p>
              Bisa. Soal dan opsi bisa disertai gambar, dan teks mendukung pecahan,
              akar, pangkat, serta simbol matematika umum.
            </p>
          </details>
          <details className="faq-item">
            <summary>Di mana hasil kuis disimpan?</summary>
            <p>
              Akun, template, dan riwayat sesi tersimpan di server. Draft yang belum
              dipublikasikan tersimpan di browser perangkatmu.
            </p>
          </details>
        </div>
      </section>

      {/* ═══ CTA AKHIR ══════════════════════════════════════════════════ */}
      <section className="cta-band">
        <h2>Siap memulai kuis pertamamu?</h2>
        <p>Buat dalam hitungan detik, atau gabung dengan kode dari host.</p>
        <div className="home-actions" style={{ justifyContent: "center", marginTop: 18 }}>
          <button type="button" className="btn btn-primary btn-lg btn-glow" onClick={() => setModalOpen(true)}>
            <PlusIcon size={18} /> Buat Quiz
          </button>
          <Link href="/dashboard" className="btn btn-ghost btn-lg">Buka Dashboard</Link>
        </div>
      </section>

      {/* ═══ FOOTER ═════════════════════════════════════════════════════ */}
      <footer className="site-footer">
        <div className="site-footer-brand">
          <span className="brand-dot" aria-hidden /> Yue Quiz
        </div>
        <nav className="site-footer-links" aria-label="Tautan footer">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/templates">Template</Link>
          <Link href="/my-quizzes">Kuis Saya</Link>
          <Link href="/riwayat">Riwayat</Link>
          <Link href="/masuk">Masuk</Link>
        </nav>
        <p className="footer-note" style={{ margin: "14px 0 0", textAlign: "left" }}>
          Platform kuis interaktif untuk kelas &amp; komunitas.
        </p>
      </footer>

      <CreateChoiceModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </main>
  )
}
