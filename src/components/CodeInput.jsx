"use client"

import { normalizeCodeInput } from "@/lib/room-client"
import { useRef } from "react"

// ═══════════════════════════════════════════════════════════════════════════
// CODE INPUT — 6 kotak ala OTP untuk kode room.
//
// NILAI DISIMPAN PADAT (tanpa celah): value = "AB3" berarti kotak 0–2 terisi.
// Kotak ke-i menampilkan value[i]. Konsekuensinya:
//   • mengetik di kotak mana pun → huruf masuk ke kotak kosong paling kiri
//     (tidak ada kode berlubang seperti "AB  D" yang bikin validasi gagal)
//   • Backspace pada kotak terisi → huruf itu dibuang, sisanya rapat ke kiri
//   • paste di mana pun → seluruh kode tersebar
//   • panah kiri/kanan untuk navigasi
//
// Value TUNGGAL string 0–6 karakter, dikontrol parent (satu sumber kebenaran),
// sehingga halaman pemanggil cukup `normalizeCodeInput(value)` saat submit.
// ═══════════════════════════════════════════════════════════════════════════

const LENGTH = 6

export function CodeInput({ value, onChange, disabled = false, autoFocus = false }) {
  const inputRefs = useRef([])

  const focusBox = (index) => {
    const target = inputRefs.current[Math.max(0, Math.min(LENGTH - 1, index))]
    target?.focus()
    target?.select?.()
  }

  /** Buang karakter di `index` (Backspace pada kotak terisi). */
  const removeAt = (index) => {
    const chars = value.split("")
    chars.splice(index, 1)
    onChange(chars.join("").slice(0, LENGTH))
  }

  const handlePaste = (event) => {
    event.preventDefault()
    if (disabled) return
    const text = normalizeCodeInput(event.clipboardData?.getData("text") || "")
    onChange(text.slice(0, LENGTH))
    focusBox(Math.min(text.length, LENGTH - 1))
  }

  return (
    <div className="otp-group" onPaste={handlePaste} aria-label="Kode room 6 huruf">
      {Array.from({ length: LENGTH }, (_, index) => {
        const char = value[index] || ""
        return (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el
            }}
            type="text"
            className={`otp-box${char ? " is-filled" : ""}`}
            value={char}
            disabled={disabled}
            maxLength={1}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            spellCheck={false}
            aria-label={`Huruf ${index + 1} dari kode room`}
            autoFocus={autoFocus && index === 0}
            onChange={(event) => {
              const clean = normalizeCodeInput(event.target.value)
              if (clean.length === 0) {
                if (char) removeAt(index)
                return
              }
              // Gabungkan huruf baru pada posisi ini, lalu rapatkan ke kiri.
              const merged = (value.slice(0, index) + clean).slice(0, LENGTH)
              onChange(merged)
              focusBox(merged.length)
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                event.preventDefault()
                if (char) {
                  removeAt(index)
                  focusBox(index)
                } else if (index > 0) {
                  removeAt(index - 1)
                  focusBox(index - 1)
                }
                return
              }
              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault()
                focusBox(index - 1)
              }
              if (event.key === "ArrowRight" && index < LENGTH - 1) {
                event.preventDefault()
                focusBox(index + 1)
              }
            }}
          />
        )
      })}
    </div>
  )
}
