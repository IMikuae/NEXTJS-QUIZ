"use client"

import { CopyButton } from "@/components/CopyButton"
import { PlayerChips } from "@/components/PlayerChips"
import { describeSettings, normalizeSettings } from "@/components/QuizSettingsPanel"

// ═══════════════════════════════════════════════════════════════════════════
// HOST LOBBY — kode raksasa + QR join (api.qrserver.com, tanpa package) +
// chip pemain berwarna + RINGKASAN ATURAN KUIZ yang akan dijalankan.
//
// Menampilkan pengaturan itu penting: host harus tahu apa yang akan terjadi
// (mode live vs ujian, batas waktu, cara menilai, lulus berapa) SEBELUM menekan
// "Mulai Kuis" — bukan menemukannya setelah pemain menjawab.
//
// QR gagal dimuat → img disembunyikan (onError), kode teks + CopyButton tetap
// jadi fallback non-jaringan.
// ═══════════════════════════════════════════════════════════════════════════

export function HostLobby({
  code,
  joinUrl,
  playerCount,
  players,
  totalQuestions,
  title,
  busy,
  projector,
  settings,
  locked,
  onStart,
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(joinUrl)}`
  const s = normalizeSettings(settings)
  const summary = describeSettings(s)

  const rules = [
    { label: "Mode", value: s.mode === "exam" ? "Ujian (mandiri)" : "Live (serempak)", hint: s.mode === "exam" ? "Tiap pemain punya waktu sendiri. Tidak ada pembahasan di tengah." : "Host yang menekan Soal Berikutnya, lalu jawaban dibahas bersama." },
    { label: "Waktu", value: summary.time, hint: s.timeMode === "none" ? "Kuis berakhir hanya kalau host mengakhiri atau soal habis." : "Batas waktu ditentukan server, bukan browser pemain." },
    { label: "Penilaian", value: summary.scoring, hint: s.scoringMode === "exam" ? `Nilai akhir = benar ÷ jumlah soal × 100. Lulus bila ≥ ${s.passingScore}.` : "Jawaban benar bernilai 1.000–2.000 poin (bonus kecepatan)." },
    {
      label: "Umpan balik",
      value: s.instantFeedback ? "Sekali jawab" : "Saat pembahasan",
      hint: s.instantFeedback ? "Pemain melihat benar/salah langsung setelah menjawab." : "Pemain baru tahu benar/salah saat fase pembahasan.",
    },
  ]

  return (
    <div className={projector ? "host-grid" : ""}>
      <div className="card glass-card">
        <h1 className="card-title center">Bagikan kode ini ke pemain</h1>
        <p className="room-code">{code}</p>
        <p className="room-code-caption">Kode room</p>

        {locked ? (
          <div className="alert alert-warning" role="status">
            Lobby sedang <strong>dikunci</strong> — pemain baru tidak bisa bergabung
            sampai kuncinya dibuka.
          </div>
        ) : null}

        <div className="btn-row" style={{ justifyContent: "center" }}>
          <CopyButton value={code} label="Copy kode" />
          <CopyButton value={joinUrl} label="Copy link join" />
        </div>

        <div className="counter-row">
          <div className="stat">
            <span className="stat-value">{playerCount}</span>
            <span className="stat-label">Pemain di lobby</span>
          </div>
          <div className="stat">
            <span className="stat-value">{totalQuestions}</span>
            <span className="stat-label">Soal</span>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={playerCount === 0 || busy}
            onClick={onStart}
            title={playerCount === 0 ? "Tunggu minimal satu pemain bergabung" : undefined}
          >
            {busy && <span className="spinner" aria-hidden />}
            Mulai Quiz
          </button>
        </div>

        {players.length > 0 ? (
          <PlayerChips players={players} />
        ) : (
          <div className="waiting">
            <span className="pulse-dots" aria-hidden>
              <span /><span /><span />
            </span>
            Menunggu pemain bergabung…
          </div>
        )}

        {!projector && (
          <p className="footer-note">
            Link join: <span className="mono">{joinUrl}</span>
          </p>
        )}
      </div>

      {/* ── Ringkasan aturan yang akan dijalankan ── */}
      <div className="card glass-card">
        <h2 className="card-title">Aturan kuis ini</h2>
        <p className="card-hint">
          <strong>{title}</strong> · {totalQuestions} soal. Pastikan semuanya sesuai
          sebelum menekan “Mulai Quiz” — pengaturan tidak bisa diubah di tengah sesi.
        </p>

        <ul className="rules-list">
          {rules.map((rule) => (
            <li className="rules-item" key={rule.label}>
              <span className="rules-label">{rule.label}</span>
              <span className="rules-value">{rule.value}</span>
              <span className="rules-hint">{rule.hint}</span>
            </li>
          ))}
          <li className="rules-item">
            <span className="rules-label">Acak</span>
            <span className="rules-value">
              {[s.shuffleQuestions ? "soal" : null, s.shuffleOptions ? "opsi" : null]
                .filter(Boolean)
                .join(" + ") || "tidak ada"}
            </span>
            <span className="rules-hint">
              Pengacakan dilakukan server saat kuis dimulai, jadi urutannya sama untuk
              semua pemain yang memakai soal itu.
            </span>
          </li>
          {s.mode === "exam" ? (
            <li className="rules-item">
              <span className="rules-label">Kembali</span>
              <span className="rules-value">{s.allowBack ? "boleh" : "tidak boleh"}</span>
              <span className="rules-hint">
                Mengizinkan pemain menengok soal sebelumnya (jawaban tetap tidak bisa
                diubah).
              </span>
            </li>
          ) : null}
        </ul>
      </div>

      {!projector && (
        <div className="card glass-card" style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <h2 className="card-title">Scan untuk gabung</h2>
          <p className="card-hint" style={{ textAlign: "center" }}>
            Pemain cukup mengarahkan kamera HP ke QR ini.
          </p>
          <div className="qr-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrSrc}
              alt={`QR code untuk bergabung ke room ${code}`}
              width={280}
              height={280}
              onError={(event) => {
                // QR eksternal gagal (offline/blokir) → sembunyikan; kode teks
                // di kartu sebelah tetap berfungsi sebagai fallback.
                event.currentTarget.closest(".qr-wrap").style.display = "none"
              }}
            />
            <span className="qr-caption">{joinUrl}</span>
          </div>
        </div>
      )}
    </div>
  )
}
