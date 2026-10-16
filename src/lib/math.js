// ═══════════════════════════════════════════════════════════════════════════
// MATH — render matematika ringan (CONTRACT §7)
// ═══════════════════════════════════════════════════════════════════════════
// Fungsi MURNI, tanpa React dan tanpa DOM. parseMath() mengubah teks soal
// menjadi daftar token; MathText.jsx yang merendernya (tanpa
// dangerouslySetInnerHTML).
//
// Token yang dihasilkan:
//   { type: "text",  value: string }
//   { type: "frac",  num: Token[], den: Token[] }
//   { type: "mixed", whole: Token[], num: Token[], den: Token[] }
//   { type: "sqrt",  index: null,    body: Token[] }
//   { type: "root",  index: Token[], body: Token[] }
//   { type: "sup",   base: Token[], value: Token[] }
//   { type: "sub",   base: Token[], value: Token[] }
//   { type: "abs",   body: Token[] }
//
// CATATAN BENTUK: bidang (num/den/body/base/value/index) berisi DAFTAR TOKEN,
// bukan string — supaya isi pecahan/akar/pangkat juga ikut dirender
// (mis. sqrt(x^2) atau x^(n+1)). Isi selalu lebih pendek dari sumbernya, jadi
// rekursinya pasti berhenti. MathText menerima string MAUPUN daftar token di
// setiap bidang, jadi bentuk sederhana pun tetap jalan.
//
// ATURAN PENTING (CONTRACT §7):
//   • Pecahan & bilangan campuran HANYA dikenali bila polanya merupakan satu
//     kata utuh (diapit spasi / di awal / di akhir teks). Karena itu
//     "12/03/2026", "dan/atau", "a/b/c", dan "https://x.com/a" tetap teks biasa.
//   • Akar, pangkat, indeks, dan nilai mutlak boleh menempel pada kata.
//   • `lim`, `sum`, `int` sengaja TIDAK diubah menjadi simbol — CONTRACT §7
//     meminta ditampilkan tegak apa adanya (font aplikasi juga tidak miring),
//     jadi keduanya lewat sebagai teks biasa tanpa perlakuan khusus.
// ═══════════════════════════════════════════════════════════════════════════

/** Batas panjang teks yang masih diparse. Di atas ini dikembalikan apa adanya
 *  supaya tidak ada pekerjaan berat di jalan render (soal dibatasi 500 huruf,
 *  jadi angka ini hanya jaring pengaman). */
const MAX_PARSE_LENGTH = 4000

/** Simbol yang punya peran tetap: ditulis apa adanya di palet editor. */
export const MATH_SYMBOLS = [
  "½", "⅓", "¼", "¾", "⅔",
  "√", "∛", "×", "÷", "±",
  "≤", "≥", "≠", "≈", "∞",
  "π", "θ", "°", "²", "³",
  "ⁿ", "₁", "₂", "₃", "∑", "∫",
]

/** Tombol template (menyisipkan pola, bukan satu karakter). */
export const MATH_TEMPLATES = [
  { id: "frac", label: "Pecahan", insert: "a/b", select: [0, 1], hint: "Pecahan: pembilang/penyebut" },
  { id: "sqrt", label: "Akar", insert: "sqrt()", caret: 5, hint: "Akar kuadrat" },
  { id: "sup", label: "Pangkat", insert: "^()", caret: 2, hint: "Pangkat atas" },
]

// ─── Normalisasi simbol ────────────────────────────────────────────────────

const WORD_SYMBOLS = {
  pi: "π",
  theta: "θ",
  alpha: "α",
  beta: "β",
  deg: "°",
}

/**
 * Ubah notasi ASCII menjadi simbolnya: `<=` → ≤, `>=` → ≥, `!=` → ≠,
 * `+-` → ±, `*` → ×, `xx` → ×, `pi`/`theta`/`alpha`/`beta`/`deg` → π θ α β °.
 *
 * Kata (pi/theta/…) hanya diganti bila berdiri sendiri — batasnya selain
 * huruf dan tanda hubung, supaya "spin" dan kata Indonesia "deg-degan" tidak
 * ikut berubah.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeSymbols(text) {
  let out = String(text ?? "")
  if (out.length === 0) return out

  out = out.replace(/<=/g, "≤")
  out = out.replace(/>=/g, "≥")
  out = out.replace(/!=/g, "≠")
  out = out.replace(/\+-/g, "±")
  out = out.replace(/xx(?![A-Za-z-])/g, "×")
  out = out.replace(/\*/g, "×")
  out = out.replace(
    /(?<![A-Za-z-])(pi|theta|alpha|beta|deg)(?![A-Za-z-])/gi,
    (match) => WORD_SYMBOLS[match.toLowerCase()] ?? match
  )

  return out
}

// ─── Pemisahan kata ────────────────────────────────────────────────────────

/** Pecah teks menjadi item kata & spasi (spasi dipertahankan apa adanya). */
function splitItems(text) {
  const items = []
  const re = /\s+/g
  let last = 0
  let match = re.exec(text)
  while (match) {
    if (match.index > last) items.push({ kind: "word", value: text.slice(last, match.index) })
    items.push({ kind: "space", value: match[0] })
    last = match.index + match[0].length
    match = re.exec(text)
  }
  if (last < text.length) items.push({ kind: "word", value: text.slice(last) })
  return items
}

// ─── Pengenalan pola pecahan ───────────────────────────────────────────────

/** Operand pecahan: deretan huruf/angka (boleh bertanda). */
function isOperand(text) {
  return /^[+-]?[A-Za-z0-9]+$/.test(text)
}

/** Satu huruf saja (a, b, x, n) — boleh bertanda. */
function isSingleLetter(text) {
  return /^[+-]?[A-Za-z]$/.test(text)
}

/**
 * Apakah satu kata utuh berbentuk pecahan `a/b`?
 *
 * Syarat tambahan supaya teks biasa tidak ikut jadi pecahan:
 *   • hanya SATU garis miring (menolak `12/03/2026`, `a/b/c`, `https://x.com/a`)
 *   • minimal satu sisi mengandung angka, ATAU kedua sisi satu huruf (`a/b`)
 *     — inilah yang menolak `dan/atau`.
 *
 * @returns {{ num: string, den: string } | null}
 */
export function asFractionWord(word) {
  const match = /^([^/]+)\/([^/]+)$/.exec(word)
  if (!match) return null

  const num = match[1]
  const den = match[2]
  if (!isOperand(num) || !isOperand(den)) return null

  const hasDigit = /\d/.test(num) || /\d/.test(den)
  if (!hasDigit && !(isSingleLetter(num) && isSingleLetter(den))) return null

  return { num, den }
}

/**
 * Sama seperti asFractionWord, tapi mengizinkan tanda kurung pembungkus:
 * `(3/4)` → `(` + pecahan + `)`. Dipakai supaya "Hitung (3/4 + 1/8)" —
 * di mana kurung menempel pada kata — tetap mengenali pecahannya.
 *
 * @returns {{ prefix: string, suffix: string, num: string, den: string } | null}
 */
function fractionParts(word) {
  let inner = word
  let prefix = ""
  let suffix = ""

  while (inner.startsWith("(")) {
    prefix += "("
    inner = inner.slice(1)
  }
  while (inner.endsWith(")")) {
    suffix = `)${suffix}`
    inner = inner.slice(0, -1)
  }

  const frac = asFractionWord(inner)
  if (!frac) return null
  return { prefix, suffix, num: frac.num, den: frac.den }
}

/** Nilai kata sebelum `from` (melewati spasi), atau null. */
function prevWordValue(items, from) {
  for (let i = from; i >= 0; i -= 1) {
    if (items[i].kind === "word") return items[i].value
  }
  return null
}

/** Kata tepat sesudah item kata `index` (dipisah satu blok spasi), atau null. */
function adjacentWord(items, index) {
  if (items[index + 1]?.kind !== "space") return null
  return items[index + 2]?.kind === "word" ? items[index + 2].value : null
}

function isIntegerWord(word) {
  return /^[+-]?\d+$/.test(word)
}

// ─── Pemindai dalam satu kata ──────────────────────────────────────────────

/** Ambil kelompok setelah `^`/`_`: `(...)` atau deretan huruf-angka. */
function readGroup(word, start) {
  if (start >= word.length) return null

  if (word[start] === "(") {
    let depth = 0
    for (let i = start; i < word.length; i += 1) {
      if (word[i] === "(") depth += 1
      else if (word[i] === ")") {
        depth -= 1
        if (depth === 0) return { value: word.slice(start + 1, i), next: i + 1 }
      }
    }
    return null
  }

  const match = /^[A-Za-z0-9]+/.exec(word.slice(start))
  if (!match) return null
  return { value: match[0], next: start + match[0].length }
}

/** Basis pangkat/indeks = ekor buffer (kelompok kurung seimbang bila ada). */
function takeTrailingBase(buffer) {
  if (!buffer) return { text: "", consumed: 0 }

  if (buffer.endsWith(")")) {
    let depth = 0
    for (let i = buffer.length - 1; i >= 0; i -= 1) {
      if (buffer[i] === ")") depth += 1
      else if (buffer[i] === "(") {
        depth -= 1
        if (depth === 0) return { text: buffer.slice(i), consumed: buffer.length - i }
      }
    }
    return { text: "", consumed: 0 }
  }

  const match = /[A-Za-z0-9.,]+$/.exec(buffer)
  if (!match) return { text: "", consumed: 0 }
  return { text: match[0], consumed: match[0].length }
}

const ROOT_CHARS = { "√": null, "∛": "3", "∜": "4" }

/**
 * Pindai satu kata: kenali akar, nilai mutlak, pangkat, dan indeks.
 *
 * `allowBareMarker` menyalakan pengecualian untuk kasus "tidak ada basis":
 * dipakai HANYA bila penanda "^" atau "_" berada di awal teks (mis. soal yang
 * ditulis "_1" saja). Di tengah teks, penanda tanpa basis diperlakukan sebagai
 * teks biasa supaya deretan garis bawah pada kata tidak berubah jadi notasi.
 */
function scanWord(word, allowBareMarker = false) {
  const out = []
  let buffer = ""
  let i = 0

  const flush = () => {
    if (buffer) {
      out.push({ type: "text", value: buffer })
      buffer = ""
    }
  }

  while (i < word.length) {
    const rest = word.slice(i)

    // root(3)(8) — akar dengan pangkat
    let match = /^root\(([^()]*)\)\(([^()]*)\)/.exec(rest)
    if (match) {
      flush()
      out.push({ type: "root", index: parseTokens(match[1]), body: parseTokens(match[2]) })
      i += match[0].length
      continue
    }

    // sqrt(3) / root(3) — akar biasa
    match = /^(?:root|sqrt)\(([^()]*)\)/.exec(rest)
    if (match) {
      flush()
      out.push({ type: "sqrt", index: null, body: parseTokens(match[1]) })
      i += match[0].length
      continue
    }

    // √3 / √(x+1) / ∛8
    match = /^([√∛∜])(?:\(([^()]*)\)|([A-Za-z0-9.,]+))/.exec(rest)
    if (match) {
      const body = match[2] ?? match[3] ?? ""
      const index = ROOT_CHARS[match[1]]
      flush()
      out.push(
        index
          ? { type: "root", index: parseTokens(index), body: parseTokens(body) }
          : { type: "sqrt", index: null, body: parseTokens(body) }
      )
      i += match[0].length
      continue
    }

    // |x|
    match = /^\|([^|]+)\|/.exec(rest)
    if (match) {
      flush()
      out.push({ type: "abs", body: parseTokens(match[1]) })
      i += match[0].length
      continue
    }

    // x^2 / x^(n+1) / a_1
    const char = rest[0]
    if (char === "^" || char === "_") {
      const group = readGroup(word, i + 1)
      if (group) {
        const base = takeTrailingBase(buffer)
        const hasBase = base.consumed > 0 || (allowBareMarker && buffer.length === 0 && i === 0)

        if (hasBase) {
          if (base.consumed > 0) buffer = buffer.slice(0, buffer.length - base.consumed)
          flush()
          out.push({
            type: char === "^" ? "sup" : "sub",
            base: parseTokens(base.text),
            value: parseTokens(group.value),
          })
          i = group.next
          continue
        }
      }
    }

    buffer += char
    i += 1
  }

  flush()
  return out
}

// ─── Parser utama ──────────────────────────────────────────────────────────

function parseTokens(text) {
  if (!text) return []

  const items = splitItems(text)
  const tokens = []

  // Pecahan berspasi ("3 / 4") hanya masuk akal kalau garis miring di seluruh
  // teks tidak lebih dari satu. Dengan begitu "12 / 03 / 2026" dan
  // "a / b / c" otomatis tetap teks biasa tanpa perlu menebak.
  let slashCount = 0
  for (const item of items) {
    if (item.kind !== "word") continue
    for (const char of item.value) {
      if (char === "/") slashCount += 1
    }
  }
  const allowSpacedFraction = slashCount === 1

  const pushText = (value) => {
    const prev = tokens[tokens.length - 1]
    if (prev?.type === "text") prev.value += value
    else tokens.push({ type: "text", value })
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]

    if (item.kind === "space") {
      pushText(item.value)
      continue
    }

    const word = item.value

    // Bilangan campuran: "2 1/2" → 2½
    if (isIntegerWord(word) && items[i + 1]?.kind === "space" && items[i + 2]?.kind === "word") {
      const frac = asFractionWord(items[i + 2].value)
      if (frac) {
        tokens.push({
          type: "mixed",
          whole: parseTokens(word),
          num: parseTokens(frac.num),
          den: parseTokens(frac.den),
        })
        i += 2
        continue
      }
    }

    // Pecahan satu kata: "3/4" (kurung pembungkus ikut dikenali: "(3/4)")
    const parts = fractionParts(word)
    if (parts) {
      if (parts.prefix) pushText(parts.prefix)
      tokens.push({
        type: "frac",
        num: parseTokens(parts.num),
        den: parseTokens(parts.den),
      })
      if (parts.suffix) pushText(parts.suffix)
      continue
    }

    // Pecahan berspasi: "3 / 4". SENGAJA hanya diaktifkan bila seluruh teks
    // memuat TEPAT SATU garis miring — begitu ada dua atau lebih ("12 / 03 /
    // 2026", "a / b / c"), semua garis miring diperlakukan sebagai teks biasa.
    // Aturan ini sederhana, bisa dijelaskan, dan tidak pernah menebak-nebak.
    if (allowSpacedFraction && isOperand(word) && /\d/.test(word) && adjacentWord(items, i) === "/") {
      const slashIndex = i + 2
      const rightIndex = slashIndex + 2
      const den = items[rightIndex]?.kind === "word" ? items[rightIndex].value : null

      if (den !== null && /^\d+$/.test(den)) {
        tokens.push({
          type: "frac",
          num: parseTokens(word),
          den: parseTokens(den),
        })
        i = rightIndex
        continue
      }
    }

    // Penanda di awal TEKS (bukan hanya awal kata) boleh tanpa basis:
    // "_1" atau "^2" yang ditulis berdiri sendiri tetap dirender.
    const previousWord = prevWordValue(items, i - 1)
    const allowBareMarker = !previousWord
    for (const token of scanWord(word, allowBareMarker)) {
      if (token.type === "text") pushText(token.value)
      else tokens.push(token)
    }
  }

  return tokens
}

/**
 * Ubah teks menjadi daftar token matematika. Tidak pernah melempar.
 *
 * @param {string} input
 * @returns {Array<object>}
 */
export function parseMath(input) {
  try {
    const text = normalizeSymbols(input)
    if (text.length === 0) return []
    if (text.length > MAX_PARSE_LENGTH) return [{ type: "text", value: text }]
    return parseTokens(text)
  } catch {
    // Apa pun yang tidak terduga: tampilkan apa adanya, jangan sampai halaman
    // soal gagal render hanya karena satu soal.
    return [{ type: "text", value: String(input ?? "") }]
  }
}

// ─── Teks biasa ────────────────────────────────────────────────────────────

function plainList(list) {
  if (typeof list === "string") return list
  if (!Array.isArray(list)) return ""
  return list.map(plainToken).join("")
}

function plainToken(token) {
  if (!token || typeof token !== "object") return ""

  switch (token.type) {
    case "text":
      return token.value
    case "frac":
      return `${plainList(token.num)}/${plainList(token.den)}`
    case "mixed":
      return `${plainList(token.whole)} ${plainList(token.num)}/${plainList(token.den)}`
    case "sqrt":
      return `sqrt(${plainList(token.body)})`
    case "root":
      return `root(${plainList(token.index)})(${plainList(token.body)})`
    case "sup": {
      const value = plainList(token.value)
      return `${plainList(token.base)}^${/^[A-Za-z0-9]+$/.test(value) ? value : `(${value})`}`
    }
    case "sub": {
      const value = plainList(token.value)
      return `${plainList(token.base)}_${/^[A-Za-z0-9]+$/.test(value) ? value : `(${value})`}`
    }
    case "abs":
      return `|${plainList(token.body)}|`
    default:
      return ""
  }
}

/**
 * Tombol "lihat sebagai teks biasa" di editor: apa yang BENAR-BENAR tersimpan,
 * tanpa render matematika.
 *
 * @param {string|Array<object>} input teks mentah atau hasil parseMath()
 * @returns {string}
 */
export function mathToPlainText(input) {
  if (Array.isArray(input)) return plainList(input)
  return plainList(parseMath(input))
}

/** Apakah teks punya setidaknya satu token matematika (untuk badge di editor). */
export function hasMath(input) {
  return parseMath(input).some((token) => token.type !== "text")
}
