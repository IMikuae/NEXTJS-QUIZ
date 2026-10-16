"use client"

import { MATH_SYMBOLS, MATH_TEMPLATES } from "@/lib/math"

// ═══════════════════════════════════════════════════════════════════════════
// MATH PALETTE — deretan tombol simbol + template yang menyisipkan teks ke
// POSISI KURSOR di kolom yang sedang fokus (CONTRACT §7).
// ═══════════════════════════════════════════════════════════════════════════
// Editor memegang satu ref "kolom yang terakhir difokuskan" (teks soal, opsi,
// atau penjelasan) dan menyerahkannya ke sini. Palet membaca selectionStart /
// selectionEnd dari elemen itu, menyusun nilai baru, lalu MEMINTA parent
// memperbarui state lewat `onValueChange` — jadi palet tidak menyimpan nilai
// apa pun sendiri (nilai tetap milik React, satu sumber kebenaran).
//
// Setelah menyisipkan, kursor dikembalikan ke posisi yang masuk akal:
//   • simbol tunggal  → kursor setelah simbol
//   • template "a/b"  → "a" ikut terpilih supaya langsung bisa diganti
//   • "sqrt()"        → kursor DI DALAM kurung
//
// Tanpa kolom yang fokus, tombol dinonaktifkan (bukan gagal diam-diam) dan
// ada petunjuk singkat supaya tidak membingungkan.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sisipkan `text` ke elemen yang sedang fokus.
 * @param {HTMLElement|null} element
 * @param {string} text
 * @param {{ onValueChange: (element: HTMLElement, next: string) => void,
 *           selectStart?: number, selectEnd?: number }} options
 */
function insertInto(element, text, { onValueChange, selectStart, selectEnd }) {
  const start = element.selectionStart ?? element.value.length
  const end = element.selectionEnd ?? start
  const next = element.value.slice(0, start) + text + element.value.slice(end)

  onValueChange(element, next)

  const caretFrom = start + (selectStart ?? text.length)
  const caretTo = start + (selectEnd ?? selectStart ?? text.length)

  // Setelah React menulis ulang nilai ke DOM, baru posisi kursor dipasang.
  requestAnimationFrame(() => {
    try {
      element.focus()
      element.setSelectionRange(caretFrom, Math.max(caretFrom, caretTo))
    } catch {
      // Elemen sudah dilepas dari DOM (soal berganti saat tombol diklik) —
      // abaikan, teksnya tetap tersimpan.
    }
  })
}

export function MathPalette({ targetRef, targetKey, onValueChange, label = "Simbol matematika", hint }) {
  // `targetKey` diisi pemanggil dengan penanda kolom yang sedang fokus. Kita
  // memakai KEY itu (state, bukan ref) untuk menentukan aktif/tidak — ref tidak
  // boleh dibaca saat render (aturan React). Nilai ref hanya dibaca di dalam
  // handler klik, yang berjalan setelah commit dan aman.
  const hasTarget = Boolean(targetKey)

  const insert = (text, options = {}) => {
    const element = targetRef?.current
    if (!element) return
    insertInto(element, text, { onValueChange, ...options })
  }

  return (
    <div className="symbol-palette">
      <div className="symbol-palette-head">
        <span className="filter-group-title" style={{ margin: 0 }}>{label}</span>
        <span className="symbol-palette-note">
          {hasTarget ? "disisipkan di posisi kursor" : (hint || "klik dulu kolom teksnya")}
        </span>
      </div>

      <div className="symbol-grid">
        {MATH_SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            className="symbol-btn"
            disabled={!hasTarget}
            title={`Sisipkan ${symbol}`}
            aria-label={`Sisipkan ${symbol}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insert(symbol)}
          >
            {symbol}
          </button>
        ))}
      </div>

      <div className="symbol-templates">
        {MATH_TEMPLATES.map((template) => (
          <button
            key={template.id}
            type="button"
            className="btn btn-sm"
            disabled={!hasTarget}
            title={template.hint}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (template.select) {
                insert(template.insert, {
                  selectStart: template.select[0],
                  selectEnd: template.select[1],
                })
                return
              }
              insert(template.insert, {
                selectStart: template.caret ?? template.insert.length,
                selectEnd: template.caret ?? template.insert.length,
              })
            }}
          >
            {template.label}
            <span className="mono" style={{ marginLeft: 6, opacity: 0.7 }}>
              {template.insert}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
