"use client"

import { Fragment } from "react"
import { parseMath } from "@/lib/math"

// ═══════════════════════════════════════════════════════════════════════════
// MATH TEXT — perender token dari parseMath() (CONTRACT §7)
// ═══════════════════════════════════════════════════════════════════════════
// Tanpa dangerouslySetInnerHTML: setiap token jadi elemen React biasa dengan
// kelas CSS di globals.css (section "Render matematika"):
//   .math-frac/.math-num/.math-den  — pecahan bertumpuk
//   .math-mixed                     — bilangan campuran
//   .math-root/.math-sqrt-body      — akar (garis atas via border-top)
//   .math-root-index                — angka kecil pangkat akar
//   .math-sup/.math-sub/.math-abs   — pangkat, indeks, nilai mutlak
//
// Menerima `tokens` (hasil parseMath) ATAU `text` mentah (di-parse sendiri).
// Bidang isi (num/den/body/…) boleh string sederhana ATAU daftar token.
// ═══════════════════════════════════════════════════════════════════════════

function renderTokenList(list) {
  if (typeof list === "string") return list
  if (!Array.isArray(list)) return null
  return list.map((token, index) => <Fragment key={index}>{renderToken(token, index)}</Fragment>)
}

function renderToken(token, key) {
  if (!token || typeof token !== "object") return null

  switch (token.type) {
    case "text":
      return <Fragment key={key}>{token.value}</Fragment>

    case "frac":
      return (
        <span className="math-frac" key={key}>
          <span className="math-num">{renderTokenList(token.num)}</span>
          <span className="math-den">{renderTokenList(token.den)}</span>
        </span>
      )

    case "mixed":
      return (
        <span className="math-mixed" key={key}>
          {renderTokenList(token.whole)}
          <span className="math-frac">
            <span className="math-num">{renderTokenList(token.num)}</span>
            <span className="math-den">{renderTokenList(token.den)}</span>
          </span>
        </span>
      )

    case "sqrt":
      return (
        <span className="math-root" key={key}>
          <span className="math-root-sign" aria-hidden>√</span>
          <span className="math-sqrt-body">{renderTokenList(token.body)}</span>
        </span>
      )

    case "root":
      return (
        <span className="math-root" key={key}>
          <span className="math-root-sign" aria-hidden>√</span>
          <span className="math-root-index" aria-hidden>{renderTokenList(token.index)}</span>
          <span className="math-sqrt-body">{renderTokenList(token.body)}</span>
        </span>
      )

    case "sup":
      return (
        <span className="math-sup-wrap" key={key}>
          {renderTokenList(token.base)}
          <sup className="math-sup">{renderTokenList(token.value)}</sup>
        </span>
      )

    case "sub":
      return (
        <span className="math-sub-wrap" key={key}>
          {renderTokenList(token.base)}
          <sub className="math-sub">{renderTokenList(token.value)}</sub>
        </span>
      )

    case "abs":
      return (
        <span className="math-abs" key={key}>
          <span className="math-abs-bar" aria-hidden>|</span>
          {renderTokenList(token.body)}
          <span className="math-abs-bar" aria-hidden>|</span>
        </span>
      )

    default:
      return null
  }
}

/**
 * @param {{
 *   tokens?: Array<object>,
 *   text?: string,
 *   as?: string,
 *   className?: string,
 * }} props
 */
export function MathText({ tokens, text, as: Tag = "span", className = "" }) {
  const list = tokens ?? parseMath(text ?? "")
  return <Tag className={`math-text${className ? ` ${className}` : ""}`}>{renderTokenList(list)}</Tag>
}
