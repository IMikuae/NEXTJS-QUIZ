// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES DATA — kategori + ringkasan template bawaan (KLIEN-AMAN).
// ═══════════════════════════════════════════════════════════════════════════
// ATURAN KUNCI JAWABAN:
//   • Berkas ini DIIMPOR KOMPONEN KLIEN. Karena itu ia TIDAK memuat teks soal
//     maupun `correctIndex` sama sekali.
//   • Data penuh (teks soal + kunci) ada di `templates-data.server.js`, yang
//     dijaga `server-guard` dan HANYA boleh dipakai kode server.
//   • Yang diekspor di sini hanya metadata ringkas + durasi per soal
//     (non-rahasia), cukup untuk membangun kartu & pratinjau publik.
//   • Jawaban asli diberikan lewat API server (`/api/templates/builtin/[id]`)
//     hanya saat pengguna benar-benar memilih memakai template.
// ═══════════════════════════════════════════════════════════════════════════

export const CATEGORIES = [
  { id: "matematika", label: "Matematika", icon: "÷" },
  { id: "binggris", label: "Bahasa Inggris", icon: "🔤" },
  { id: "ipa", label: "IPA", icon: "🔬" },
  { id: "ips", label: "IPS", icon: "🌏" },
  { id: "sejarah", label: "Sejarah", icon: "🏛️" },
  { id: "teknologi", label: "Teknologi", icon: "💻" },
  { id: "akuntansi", label: "Akuntansi", icon: "📊" },
  { id: "olahraga", label: "Olahraga", icon: "⚽" },
  { id: "umum", label: "Umum", icon: "💡" },
  { id: "icebreaker", label: "Ice Breaker", icon: "🎉" },
  { id: "trivia", label: "Trivia", icon: "🎲" },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

// ─── Ringkasan template bawaan (TANPA soal / kunci jawaban) ─────────────────
// `questionTimes` hanya menyimpan DURASI tiap soal (non-rahasia) — dipakai
// untuk menghitung estimasi waktu. Jangan pernah menambahkan teks soal atau
// kunci jawaban ke berkas ini.
const B = (id, title, description, category, level, featured, questionTimes) => ({
  id,
  title,
  description,
  category,
  level,
  featured,
  questionTimes,
})

const BUILTIN_ROWS = [
  B("tpl-perkalian-cepat", "Perkalian Cepat", "Latih kecepatan berhitung dengan soal perkalian bertingkat.", "matematika", "dasar", true, [15, 15, 15, 15, 20]),
  B("tpl-pangkas-ranting", "Bilangan Berpangkat", "Eksponen, akar, dan operasi bilangan berpangkat.", "matematika", "menengah", false, [20, 15, 20, 20, 25]),
  B("tpl-daily-conversation", "Daily Conversation", "Percakapan bahasa Inggris sehari-hari: greetings, questions, expressions.", "binggris", "dasar", true, [15, 15, 15, 15, 15, 15]),
  B("tpl-tata-surya", "Keajaiban Tata Surya", "Planet, bintang, dan fenomena luar angkasa.", "ipa", "dasar", true, [15, 15, 15, 15, 15, 20]),
  B("tpl-sel-tumbuhan", "Sel & Kehidupan", "Struktur sel, organel, dan fungsi dasarnya.", "ipa", "menengah", false, [20, 20, 20, 20, 25]),
  B("tpl-peta-indonesia", "Indonesia Negeriku", "Geografi Indonesia: provinsi, gunung, dan sungai.", "ips", "dasar", false, [15, 20, 20, 20, 15]),
  B("tpl-kemerdekaan", "Jalan Kemerdekaan", "Peristiwa penting menuju dan sesudah kemerdekaan Indonesia.", "sejarah", "menengah", false, [20, 20, 25, 25, 20]),
  B("tpl-internet-literal", "Dunia Internet", "Istilah, sejarah, dan keamanan dasar internet.", "teknologi", "dasar", true, [20, 20, 15, 15, 15, 20]),
  B("tpl-dasar-debit-kredit", "Dasar Debit & Kredit", "Konsep akuntansi dasar: persamaan akuntansi dan aturan debit-kredit.", "akuntansi", "menengah", false, [25, 20, 25, 25, 20]),
  B("tpl-olahraga-dunia", "Sport Mania", "Olahraga dunia: aturan dasar, event, dan legenda.", "olahraga", "dasar", false, [15, 20, 15, 20, 15]),
  B("tpl-aku-lebih-pilih", "Aku Lebih Pilih…", "Ice breaker ringan: pilih salah satu, lihat seberapa 'normal' kelasmu.", "icebreaker", "dasar", true, [15, 15, 15, 15, 15]),
  B("tpl-trivia-acak", "Trivia Serba Ada", "Fakta unik lintas topik untuk menutup kelas dengan seru.", "trivia", "dasar", false, [15, 15, 15, 20, 20, 15]),
]

/**
 * Rumus tampilan deterministik — SATU-SATUNYA sumber kebenaran untuk field
 * kartu (rating/usage/estimasi). `templates-data.server.js` memakai fungsi ini
 * juga supaya kartu dan halaman detail tidak pernah berbeda angka.
 *
 * @param {{ id: string, title: string, description: string, category: string,
 *           level: string, featured: boolean }} meta
 * @param {number[]} times durasi tiap soal (detik)
 */
export function summarizeBuiltin(meta, times) {
  return {
    id: meta.id,
    title: meta.title,
    description: meta.description,
    category: meta.category,
    level: meta.level,
    featured: meta.featured,
    questionCount: times.length,
    estimatedTimeMin: Math.max(1, Math.round(times.reduce((sum, t) => sum + t, 0) / 60)),
    author: "Yue Community",
    usageCount: 120 + (meta.id.length * 37) % 880, // placeholder stabilitas tampilan
    rating: 4 + ((meta.id.length * 7) % 10) / 10, // 4.0–4.9 deterministik
  }
}

/** Ringkasan template bawaan untuk kartu — TANPA teks soal & kunci jawaban. */
export const TEMPLATE_INDEX = BUILTIN_ROWS.map((row) => summarizeBuiltin(row, row.questionTimes))
