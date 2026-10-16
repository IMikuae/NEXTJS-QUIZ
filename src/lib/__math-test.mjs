// ═══════════════════════════════════════════════════════════════════════════
// UJI parseMath / normalizeSymbols / mathToPlainText
// Jalankan: node src/lib/__math-test.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Berkas ini TIDAK diimpor aplikasi — hanya skrip verifikasi (folder scripts/
// milik agent server, jadi ujinya ditaruh di sini). Aman dihapus.

import { asFractionWord, hasMath, mathToPlainText, normalizeSymbols, parseMath } from "./math.js"

let passed = 0
const failures = []

function ok(name, condition, detail = "") {
  if (condition) {
    passed += 1
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`)
  }
}

/** Ringkas daftar token jadi string pendek untuk pesan kegagalan. */
function shape(tokens) {
  return tokens
    .map((token) => {
      if (token.type === "text") return `text(${JSON.stringify(token.value)})`
      return token.type
    })
    .join(" + ")
}

/** Semua token harus teks biasa (tanpa satu pun token matematika). */
function isPlain(text) {
  return parseMath(text).every((token) => token.type === "text")
}

/** Token pertama harus bertipe tertentu. */
function startsWith(text, type) {
  return parseMath(text)[0]?.type === type
}

/** Ada token bertipe tertentu di mana pun. */
function contains(text, type) {
  return parseMath(text).some((token) => token.type === type)
}

function eq(name, actual, expected) {
  ok(name, actual === expected, `dapat ${JSON.stringify(actual)}, harusnya ${JSON.stringify(expected)}`)
}

// ═══ 1. WAJIB tetap teks biasa ═════════════════════════════════════════════
eq("tanggal 12/03/2026 tetap teks", mathToPlainText("12/03/2026"), "12/03/2026")
ok("tanggal 12/03/2026 tanpa token matematika", isPlain("12/03/2026"), shape(parseMath("12/03/2026")))
ok("dan/atau tetap teks", isPlain("dan/atau"), shape(parseMath("dan/atau")))
ok("a/b/c tetap teks", isPlain("a/b/c"), shape(parseMath("a/b/c")))
ok("URL https://x.com/a tetap teks", isPlain("https://x.com/a"), shape(parseMath("https://x.com/a")))
ok("12 / 03 / 2026 (berspasi) tetap teks", isPlain("12 / 03 / 2026"), shape(parseMath("12 / 03 / 2026")))
ok("kata 'spin' tidak jadi πn", isPlain("spin"), mathToPlainText("spin"))
ok("kata 'degan' tidak jadi °an", isPlain("degan"), mathToPlainText("degan"))
eq("kalimat biasa utuh", mathToPlainText("Ibu kota Indonesia adalah Jakarta."), "Ibu kota Indonesia adalah Jakarta.")

// ═══ 2. Pecahan ════════════════════════════════════════════════════════════
ok("3/4 jadi pecahan", startsWith("3/4", "frac"), shape(parseMath("3/4")))
ok("pecahan di awal string", parseMath("3/4 + 1/8")[0]?.type === "frac", shape(parseMath("3/4 + 1/8")))
ok("pecahan di akhir string", parseMath("hasil 7/8")[1]?.type === "frac", shape(parseMath("hasil 7/8")))
ok("pecahan berspasi 3 / 4", contains("3 / 4", "frac"), shape(parseMath("3 / 4")))
ok("a/b satu huruf jadi pecahan", startsWith("a/b", "frac"), shape(parseMath("a/b")))
eq("plain text pecahan", mathToPlainText("3/4"), "3/4")
ok("asFractionWord('3/4') benar", asFractionWord("3/4") !== null)
ok("asFractionWord('dan/atau') null", asFractionWord("dan/atau") === null)
ok("asFractionWord('12/03/2026') null", asFractionWord("12/03/2026") === null)
ok("(3/4) dengan kurung tetap pecahan", contains("Hitung (3/4 + 1/8)", "frac"), shape(parseMath("Hitung (3/4 + 1/8)")))
ok("pangkat pada pecahan berkurung", parseMath("(3/4)^2")[0]?.base?.some((t) => t.type === "frac"), shape(parseMath("(3/4)^2")))
eq("plain text (3/4)^2", mathToPlainText("(3/4)^2"), "(3/4)^2")

// ═══ 3. Bilangan campuran ══════════════════════════════════════════════════
ok("2 1/2 jadi campuran", startsWith("2 1/2", "mixed"), shape(parseMath("2 1/2")))
ok("campuran dalam kalimat", contains("Beratnya 2 1/2 kg", "mixed"), shape(parseMath("Beratnya 2 1/2 kg")))
eq("plain text campuran", mathToPlainText("2 1/2"), "2 1/2")

// ═══ 4. Akar ═══════════════════════════════════════════════════════════════
ok("sqrt(3)", startsWith("sqrt(3)", "sqrt"), shape(parseMath("sqrt(3)")))
ok("root(3)(8)", startsWith("root(3)(8)", "root"), shape(parseMath("root(3)(8)")))
ok("√144", startsWith("√144", "sqrt"), shape(parseMath("√144")))
ok("∛8 jadi root pangkat 3", startsWith("∛8", "root"), shape(parseMath("∛8")))
ok("√(x+1)", contains("√(x+1)", "sqrt"), shape(parseMath("√(x+1)")))
ok("akar bersarang sqrt(x^2)", parseMath("sqrt(x^2)")[0]?.body?.[0]?.type === "sup", shape(parseMath("sqrt(x^2)")))
eq("plain text akar", mathToPlainText("sqrt(3)"), "sqrt(3)")
eq("plain text akar pangkat", mathToPlainText("root(3)(8)"), "root(3)(8)")

// ═══ 5. Pangkat & indeks ═══════════════════════════════════════════════════
ok("x^2 jadi pangkat", startsWith("x^2", "sup"), shape(parseMath("x^2")))
ok("x^(n+1)", startsWith("x^(n+1)", "sup"), shape(parseMath("x^(n+1)")))
eq("plain text pangkat", mathToPlainText("x^(n+1)"), "x^(n+1)")
ok("_1 jadi indeks", startsWith("_1", "sub"), shape(parseMath("_1")))
ok("a_1", startsWith("a_1", "sub"), shape(parseMath("a_1")))
ok("pangkat di kalimat", contains("Luas x^2 satuan", "sup"), shape(parseMath("Luas x^2 satuan")))

// ═══ 6. Nilai mutlak ═══════════════════════════════════════════════════════
ok("|x| jadi abs", startsWith("|x|", "abs"), shape(parseMath("|x|")))
ok("|x-3| jadi abs", contains("|x-3| < 5", "abs"), shape(parseMath("|x-3| < 5")))
eq("plain text abs", mathToPlainText("|x|"), "|x|")

// ═══ 7. Simbol (normalizeSymbols) ══════════════════════════════════════════
eq("<=", normalizeSymbols("a <= b"), "a ≤ b")
eq(">=", normalizeSymbols("a >= b"), "a ≥ b")
eq("!=", normalizeSymbols("a != b"), "a ≠ b")
eq("+-", normalizeSymbols("5 +- 2"), "5 ± 2")
eq("* jadi ×", normalizeSymbols("3 * 4"), "3 × 4")
eq("xx jadi ×", normalizeSymbols("3 xx 4"), "3 × 4")
eq("pi jadi π", normalizeSymbols("pi r^2"), "π r^2")
eq("theta jadi θ", normalizeSymbols("sudut theta"), "sudut θ")
eq("beta jadi β", normalizeSymbols("beta"), "β")
eq("deg jadi °", normalizeSymbols("90 deg"), "90 °")
eq("<= diparse sebagai teks ≤", mathToPlainText("a <= b"), "a ≤ b")
ok("+- lewat parseMath", parseMath("5 +- 2")[0].value.includes("±"), shape(parseMath("5 +- 2")))

// ═══ 8. Campuran & batas ═══════════════════════════════════════════════════
ok("kombinasi lengkap", (() => {
  const types = parseMath("Hitung (3/4 + 1/8) x |x| dengan x = sqrt(2)").map((t) => t.type)
  return types.includes("frac") && types.includes("abs") && types.includes("sqrt")
})(), shape(parseMath("Hitung (3/4 + 1/8) x |x| dengan x = sqrt(2)")))
eq("string kosong", mathToPlainText(""), "")
eq("null aman", mathToPlainText(null), "")
ok("hasMath('3/4') true", hasMath("3/4") === true)
ok("hasMath('dan/atau') false", hasMath("dan/atau") === false)
ok("teks >4000 aman", parseMath("a".repeat(5000)).length === 1)
ok("parseMath tidak melempar untuk input aneh", (() => {
  try {
    parseMath("((((( sqrt( ))))")
    parseMath("|x")
    parseMath("x^")
    parseMath("^^^^")
    parseMath("3/")
    return true
  } catch {
    return false
  }
})())
ok("plain text → parse ulang tetap punya pecahan", contains(mathToPlainText("3/4 + 1/8"), "frac"))
ok("plain text → parse ulang tetap punya akar", contains(mathToPlainText("sqrt(3)"), "sqrt"))

// ═══ Laporan ═══════════════════════════════════════════════════════════════
const total = passed + failures.length
if (failures.length === 0) {
  console.log(`✓ ${passed}/${total} pemeriksaan LULUS — parseMath siap dipakai.`)
} else {
  console.log(`✗ ${failures.length}/${total} pemeriksaan GAGAL:`)
  for (const failure of failures) console.log(`   • ${failure}`)
  process.exitCode = 1
}
