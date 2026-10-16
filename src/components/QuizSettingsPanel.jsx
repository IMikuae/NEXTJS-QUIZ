"use client"

// ═══════════════════════════════════════════════════════════════════════════
// QUIZ SETTINGS — panel pengaturan kuis (CONTRACT §1) + kosakata bersama
// ═══════════════════════════════════════════════════════════════════════════
// Modul ini adalah SATU-SATUNYA tempat bentuk `settings` didefinisikan di sisi
// klien. Editor memakainya untuk menulis, halaman lain memakainya untuk
// membaca/menampilkan. Server menyimpan apa adanya (objek JSON).
//
//   settings = {
//     mode: "live" | "exam",
//     timeMode: "per-question" | "random" | "total" | "none",
//     defaultTimeSec: 30, randomMinSec: 10, randomMaxSec: 60, totalTimeSec: 600,
//     scoringMode: "competitive" | "exam",
//     instantFeedback: false, showExplanation: false,
//     shuffleQuestions: false, shuffleOptions: false,
//     passingScore: 70, allowBack: false,
//   }
//
// Setiap kontrol di panel ini punya penjelasan satu baris — host harus tahu
// APA yang akan terjadi pada pemain sebelum menekan "Mulai Kuis".
// ═══════════════════════════════════════════════════════════════════════════

import {
  DEFAULT_SETTINGS as SHARED_DEFAULT_SETTINGS,
  MAX_SETTINGS_SEC,
  MAX_TIME_SEC,
  MIN_SETTINGS_SEC,
  MIN_TIME_SEC,
  normalizeSettings as sharedNormalizeSettings,
} from "@/lib/quiz-validate"

/**
 * Nilai awal settings. Diambil dari SATU sumber (quiz-validate.js) supaya
 * default klien dan server tidak pernah berbeda. Dulu objek ini disalin ulang
 * di sini — dan salinannya mulai menyimpang (mis. batas totalTimeSec).
 */
export const DEFAULT_SETTINGS = SHARED_DEFAULT_SETTINGS

export const MODE_OPTIONS = [
  {
    id: "live",
    label: "Live (serempak)",
    desc: "Satu soal untuk semua orang. Host yang menekan “Soal Berikutnya”, lalu jawaban dibahas bersama.",
  },
  {
    id: "exam",
    label: "Ujian (mandiri)",
    desc: "Setiap pemain berjalan dengan kecepatannya sendiri. Tidak ada fase pembahasan di tengah; hasil akhir per pemain.",
  },
]

export const TIME_MODE_OPTIONS = [
  { id: "per-question", label: "Per soal", desc: "Tiap soal memakai waktunya sendiri (atau waktu bawaan)." },
  { id: "random", label: "Acak per soal", desc: "Server mengundi durasi tiap soal sekali di awal kuis." },
  { id: "total", label: "Total kuis", desc: "Satu batas waktu untuk seluruh kuis, dihitung per pemain." },
  { id: "none", label: "Tanpa batas", desc: "Tidak ada batas waktu sama sekali." },
]

export const SCORING_OPTIONS = [
  {
    id: "competitive",
    label: "Kompetitif",
    desc: "1.000 poin dasar + bonus kecepatan (maks 2.000) untuk tiap jawaban benar.",
  },
  {
    id: "exam",
    label: "Nilai ujian",
    desc: "1 poin per jawaban benar. Nilai akhir = benar ÷ jumlah soal × 100. Bonus kecepatan tidak dihitung.",
  },
]

/** Batas aman untuk angka yang diisi host (detik). */
export const TOTAL_TIME_MIN_SEC = MIN_SETTINGS_SEC
export const TOTAL_TIME_MAX_SEC = MAX_SETTINGS_SEC
export const PASSING_SCORE_MIN = 0
export const PASSING_SCORE_MAX = 100

/**
 * Pastikan settings selalu punya semua field dengan nilai yang masuk akal.
 *
 * Fungsi ini TIDAK lagi menduplikasi aturan: ia memanggil `normalizeSettings`
 * milik server (quiz-validate.js) dan mengambil `.value`-nya. Kalau server
 * menolak (mis. totalTimeSec 7200 > MAX_SETTINGS_SEC 3600), di sini hasilnya
 * jatuh ke default supaya UI tidak menampilkan angka yang pasti ditolak
 * POST /api/rooms.
 *
 * Modul quiz-validate.js sengaja murni (tanpa node:fs/process.env), jadi aman
 * diimpor dari komponen klien.
 */
export function normalizeSettings(raw) {
  const result = sharedNormalizeSettings(raw)
  return result.ok ? result.value : { ...DEFAULT_SETTINGS }
}

/** Label pendek satu baris — dipakai kartu ringkasan di lobby & daftar kuis. */
export function describeSettings(settings) {
  const s = normalizeSettings(settings)
  const mode = s.mode === "exam" ? "Ujian mandiri" : "Live serempak"
  const time =
    s.timeMode === "per-question"
      ? `${s.defaultTimeSec}s per soal`
      : s.timeMode === "random"
        ? `acak ${s.randomMinSec}–${s.randomMaxSec}s`
        : s.timeMode === "total"
          ? `total ${Math.round(s.totalTimeSec / 60)} menit`
          : "tanpa batas waktu"
  const scoring = s.scoringMode === "exam" ? `nilai ujian, lulus ≥ ${s.passingScore}` : "kompetitif"
  return { mode, time, scoring, text: `${mode} · ${time} · ${scoring}` }
}

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      {hint ? <span className="field-hint">{hint}</span> : null}
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`toggle-row${disabled ? " is-disabled" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-body">
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
    </label>
  )
}

/** Pilihan berbentuk kartu (mode & penilaian) — dua opsi, jelas bedanya. */
function OptionCards({ options, value, onChange, disabled }) {
  return (
    <div className="settings-cards">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`settings-card${value === option.id ? " is-active" : ""}`}
          aria-pressed={value === option.id}
          disabled={disabled}
          onClick={() => onChange(option.id)}
        >
          <span className="settings-card-title">{option.label}</span>
          <span className="settings-card-desc">{option.desc}</span>
        </button>
      ))}
    </div>
  )
}

function NumberField({ value, onChange, min, max, suffix, disabled, ariaLabel }) {
  return (
    <div className="num-field">
      <input
        type="number"
        className="input"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10)
          if (!Number.isInteger(parsed)) return
          onChange(Math.min(max, Math.max(min, parsed)))
        }}
      />
      {suffix ? <span className="num-field-suffix">{suffix}</span> : null}
    </div>
  )
}

/**
 * @param {{
 *   settings: object,
 *   onChange: (patch: object) => void,
 *   disabled?: boolean,
 *   questionCount?: number,
 * }} props
 */
export function QuizSettingsPanel({ settings, onChange, disabled = false, questionCount = 0 }) {
  const s = normalizeSettings(settings)
  const isExam = s.mode === "exam"

  return (
    <div className="settings-panel">
      <Field label="Mode permainan" hint="Menentukan alur yang dilihat pemain.">
        <OptionCards
          options={MODE_OPTIONS}
          value={s.mode}
          disabled={disabled}
          onChange={(mode) => onChange({ mode })}
        />
      </Field>

      <Field label="Batas waktu" hint={TIME_MODE_OPTIONS.find((o) => o.id === s.timeMode)?.desc}>
        <div className="chip-row" style={{ marginTop: 4 }}>
          {TIME_MODE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip${s.timeMode === option.id ? " is-active" : ""}`}
              aria-pressed={s.timeMode === option.id}
              disabled={disabled}
              onClick={() => onChange({ timeMode: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      {s.timeMode === "per-question" && (
        <Field label="Waktu bawaan per soal" hint={`Soal boleh punya waktu sendiri (${MIN_TIME_SEC}–${MAX_TIME_SEC}s).`}>
          <NumberField
            value={s.defaultTimeSec}
            min={MIN_TIME_SEC}
            max={MAX_TIME_SEC}
            suffix="detik"
            disabled={disabled}
            ariaLabel="Waktu bawaan per soal dalam detik"
            onChange={(defaultTimeSec) => onChange({ defaultTimeSec })}
          />
        </Field>
      )}

      {s.timeMode === "random" && (
        <Field label="Rentang undian waktu" hint="Server mengundi durasi tiap soal sekali saat kuis dimulai.">
          <div className="num-pair">
            <NumberField
              value={s.randomMinSec}
              min={MIN_TIME_SEC}
              max={s.randomMaxSec}
              suffix="s"
              disabled={disabled}
              ariaLabel="Waktu minimum undian"
              onChange={(randomMinSec) => onChange({ randomMinSec, randomMaxSec: Math.max(randomMinSec, s.randomMaxSec) })}
            />
            <span className="num-pair-dash" aria-hidden>–</span>
            <NumberField
              value={s.randomMaxSec}
              min={s.randomMinSec}
              max={MAX_TIME_SEC}
              suffix="s"
              disabled={disabled}
              ariaLabel="Waktu maksimum undian"
              onChange={(randomMaxSec) => onChange({ randomMaxSec, randomMinSec: Math.min(randomMaxSec, s.randomMinSec) })}
            />
          </div>
        </Field>
      )}

      {s.timeMode === "total" && (
        <Field label="Total waktu kuis" hint="Dihitung per pemain sejak ia mulai menjawab.">
          <NumberField
            value={s.totalTimeSec}
            min={TOTAL_TIME_MIN_SEC}
            max={TOTAL_TIME_MAX_SEC}
            suffix="detik"
            disabled={disabled}
            ariaLabel="Total waktu kuis dalam detik"
            onChange={(totalTimeSec) => onChange({ totalTimeSec })}
          />
        </Field>
      )}

      <Field label="Cara menilai" hint={SCORING_OPTIONS.find((o) => o.id === s.scoringMode)?.desc}>
        <OptionCards
          options={SCORING_OPTIONS}
          value={s.scoringMode}
          disabled={disabled}
          onChange={(scoringMode) => onChange({ scoringMode })}
        />
      </Field>

      {s.scoringMode === "exam" && (
        <Field label="Nilai minimum lulus" hint="Nilai akhir 0–100. Di bawah angka ini dianggap belum lulus.">
          <NumberField
            value={s.passingScore}
            min={PASSING_SCORE_MIN}
            max={PASSING_SCORE_MAX}
            suffix="dari 100"
            disabled={disabled}
            ariaLabel="Nilai minimum lulus"
            onChange={(passingScore) => onChange({ passingScore })}
          />
        </Field>
      )}

      <div className="settings-toggles">
        <Toggle
          label="Umpan balik langsung"
          hint={
            isExam
              ? "Pemain melihat benar/salah kilat (≤1,2 detik) lalu otomatis lanjut."
              : "Pemain melihat benar/salah segera setelah menjawab; fase tetap soal berjalan."
          }
          checked={s.instantFeedback}
          disabled={disabled}
          onChange={(instantFeedback) => onChange({ instantFeedback })}
        />
        <Toggle
          label="Tampilkan penjelasan"
          hint="Penjelasan tiap soal muncul setelah pemain menjawab atau di fase pembahasan."
          checked={s.showExplanation}
          disabled={disabled}
          onChange={(showExplanation) => onChange({ showExplanation })}
        />
        <Toggle
          label="Acak urutan soal"
          hint="Urutan soal diundi server saat kuis dimulai."
          checked={s.shuffleQuestions}
          disabled={disabled}
          onChange={(shuffleQuestions) => onChange({ shuffleQuestions })}
        />
        <Toggle
          label="Acak urutan opsi"
          hint="Urutan opsi diundi server; kunci jawaban tetap ikut berpindah."
          checked={s.shuffleOptions}
          disabled={disabled}
          onChange={(shuffleOptions) => onChange({ shuffleOptions })}
        />
        <Toggle
          label="Boleh kembali ke soal sebelumnya"
          hint="Hanya berlaku di mode ujian."
          checked={s.allowBack}
          disabled={disabled || !isExam}
          onChange={(allowBack) => onChange({ allowBack })}
        />
      </div>

      <div className="alert alert-info" style={{ marginBottom: 0 }}>
        <strong>Ringkasan:</strong> {describeSettings(s).text}
        {questionCount > 0 ? ` · ${questionCount} soal` : ""}
      </div>
    </div>
  )
}
