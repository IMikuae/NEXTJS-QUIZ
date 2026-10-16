// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES DATA (SERVER) — data PENUH + kunci jawaban. JANGAN diimpor klien.
// ═══════════════════════════════════════════════════════════════════════════
// Modul ini memuat `correctIndex`. Ia dijaga `server-guard`: bila ada komponen
// "use client" yang keliru mengimpornya, evaluasi di peramban akan melempar —
// sehingga kunci jawaban TIDAK PERNAH ikut ke bundel klien.
//
// Konsumen yang sah:
//   • src/app/api/templates/builtin/[id]/route.js  (GET data lengkap, klien
//     yang memintanya sudah memilih untuk menyalin template itu)
//   • src/app/templates/[id]/page.jsx               (server component, render
//     RINGKASAN saja — soal/kunci tetap tidak dikirim ke klien)
// ═══════════════════════════════════════════════════════════════════════════

import "./server-guard.js"
import { summarizeBuiltin } from "./templates-data.js"

const q = (text, options, correctIndex, timeSec = 20) => ({
  text,
  options,
  correctIndex,
  timeSec,
})

export const TEMPLATES = [
  {
    id: "tpl-perkalian-cepat",
    title: "Perkalian Cepat",
    description: "Latih kecepatan berhitung dengan soal perkalian bertingkat.",
    category: "matematika",
    level: "dasar",
    featured: true,
    questions: [
      q("Hasil dari 7 × 8?", ["54", "56", "63", "48"], 1, 15),
      q("Hasil dari 12 × 5?", ["50", "55", "60", "65"], 2, 15),
      q("Hasil dari 9 × 9?", ["72", "81", "90", "99"], 1, 15),
      q("Hasil dari 15 × 4?", ["45", "50", "60", "64"], 2, 15),
      q("Hasil dari 25 × 8?", ["175", "200", "225", "250"], 1, 20),
    ],
  },
  {
    id: "tpl-pangkas-ranting",
    title: "Bilangan Berpangkat",
    description: "Eksponen, akar, dan operasi bilangan berpangkat.",
    category: "matematika",
    level: "menengah",
    featured: false,
    questions: [
      q("2⁵ = ?", ["10", "16", "25", "32"], 3, 20),
      q("√144 = ?", ["10", "11", "12", "14"], 2, 15),
      q("3³ + 4² = ?", ["43", "27", "37", "35"], 0, 20),
      q("10⁴ ÷ 10² = ?", ["10²", "10⁶", "10⁸", "10"], 0, 20),
      q("Nilai x dari 5ˣ = 125?", ["2", "3", "4", "5"], 1, 25),
    ],
  },
  {
    id: "tpl-daily-conversation",
    title: "Daily Conversation",
    description: "Percakapan bahasa Inggris sehari-hari: greetings, questions, expressions.",
    category: "binggris",
    level: "dasar",
    featured: true,
    questions: [
      q('"How are you today?" — jawaban yang paling tepat…', ["I am fine, thanks", "I am 16", "Yes, I do", "On Monday"], 0, 15),
      q("Lawan kata dari \"expensive\" adalah…", ["costly", "cheap", "pricey", "luxury"], 1, 15),
      q('"I ___ to school every day." — kata yang tepat…', ["goes", "going", "go", "gone"], 2, 15),
      q("Apa arti \"How much is this?\"?", ["Siapa namamu?", "Berapa harganya?", "Di mana ini?", "Kapan datangnya?"], 1, 15),
      q("Bentuk lampau dari \"buy\" adalah…", ["buyed", "bought", "buys", "buying"], 1, 15),
      q('"Nice to meet you" diucapkan saat…', ["berpamitan", "bertemu pertama kali", "makan malam", "menolak ajakan"], 1, 15),
    ],
  },
  {
    id: "tpl-tata-surya",
    title: "Keajaiban Tata Surya",
    description: "Planet, bintang, dan fenomena luar angkasa.",
    category: "ipa",
    level: "dasar",
    featured: true,
    questions: [
      q("Planet terdekat dari Matahari?", ["Venus", "Bumi", "Merkurius", "Mars"], 2, 15),
      q("Planet merah dalam tata surya kita adalah…", ["Mars", "Jupiter", "Saturnus", "Neptunus"], 0, 15),
      q("Planet terbesar di tata surya?", ["Bumi", "Saturnus", "Jupiter", "Uranus"], 2, 15),
      q("Bumi mengelilingi Matahari dengan periode…", ["1 bulan", "365 hari", "24 jam", "10 tahun"], 1, 15),
      q("Satelit alami Bumi bernama…", ["Phobos", "Titan", "Bulan", "Europa"], 2, 15),
      q("Galaksi tempat tata surya kita berada disebut…", ["Andromeda", "Bima Sakti", "Triangulum", "Sombrero"], 1, 20),
    ],
  },
  {
    id: "tpl-sel-tumbuhan",
    title: "Sel & Kehidupan",
    description: "Struktur sel, organel, dan fungsi dasarnya.",
    category: "ipa",
    level: "menengah",
    featured: false,
    questions: [
      q("Organel yang disebut 'pusat kendali sel' adalah…", ["Mitokondria", "Nukleus", "Ribosom", "Vakuola"], 1, 20),
      q("Proses tumbuhan mengubah cahaya jadi energi disebut…", ["Respirasi", "Fotosintesis", "Transpirasi", "Fermentasi"], 1, 20),
      q("Dinding sel pada tumbuhan tersusun atas…", ["Kitin", "Selulosa", "Amilum", "Protein"], 1, 20),
      q("Tempat respirasi sel (pembangkit energi) adalah…", ["Nukleus", "Mitokondria", "Lisosom", "Golgi"], 1, 20),
      q("Sel darah merah manusia tidak memiliki…", ["Sitoplasma", "Membran", "Nukleus", "Hemoglobin"], 2, 25),
    ],
  },
  {
    id: "tpl-peta-indonesia",
    title: "Indonesia Negeriku",
    description: "Geografi Indonesia: provinsi, gunung, dan sungai.",
    category: "ips",
    level: "dasar",
    featured: false,
    questions: [
      q("Ibu kota Provinsi Jawa Barat?", ["Semarang", "Bandung", "Surabaya", "Serang"], 1, 15),
      q("Gunung tertinggi di Indonesia adalah…", ["Semeru", "Merapi", "Puncak Jaya", "Rinjani"], 2, 20),
      q("Sungai terpanjang di Indonesia?", ["Kapuas", "Bengawan Solo", "Mahakam", "Musi"], 0, 20),
      q("Pulau terbesar di Indonesia adalah…", ["Jawa", "Sumatra", "Papua", "Sulawesi"], 2, 20),
      q("Selat yang memisahkan Jawa dan Sumatra adalah Selat…", ["Makassar", "Sunda", "Lombok", "Malaka"], 1, 15),
    ],
  },
  {
    id: "tpl-kemerdekaan",
    title: "Jalan Kemerdekaan",
    description: "Peristiwa penting menuju dan sesudah kemerdekaan Indonesia.",
    category: "sejarah",
    level: "menengah",
    featured: false,
    questions: [
      q("Proklamasi Kemerdekaan Indonesia dibacakan pada tanggal…", ["17 Agustus 1945", "20 Mei 1908", "28 Oktober 1928", "10 November 1945"], 0, 20),
      q("Sumpah Pemuda diperingati setiap tanggal…", ["17 Agustus", "28 Oktober", "20 Mei", "1 Juni"], 1, 20),
      q("Organisasi pergerakan nasional pertama adalah…", ["Budi Utomo", "Taman Siswa", "Perhimpunan Indonesia", "Sarekat Islam"], 0, 25),
      q("Konferensi yang menghasilkan Perjanjian Linggarjati melibatkan…", ["Belanda", "Jepang", "Portugal", "Inggris"], 0, 25),
      q("Pahlawan dari Pertempuran Surabaya 1945 adalah…", ["Diponegoro", "Bung Tomo", "Pattimura", "Sultan Hasanuddin"], 1, 20),
    ],
  },
  {
    id: "tpl-internet-literal",
    title: "Dunia Internet",
    description: "Istilah, sejarah, dan keamanan dasar internet.",
    category: "teknologi",
    level: "dasar",
    featured: true,
    questions: [
      q("WWW ditemukan oleh…", ["Bill Gates", "Tim Berners-Lee", "Steve Jobs", "Linus Torvalds"], 1, 20),
      q("Kepanjangan HTTP adalah…", ["HyperText Transfer Protocol", "High Transfer Text Protocol", "Hyper Terminal Text Process", "Home Tool Transfer Protocol"], 0, 20),
      q("Perangkat yang menghubungkan jaringan lokal ke internet disebut…", ["Monitor", "Router", "Printer", "Scanner"], 1, 15),
      q("Format file gambar yang mendukung transparansi adalah…", ["PNG", "MP3", "DOCX", "AVI"], 0, 15),
      q("Sandi yang kuat sebaiknya…", ["nama sendiri", "tanggal lahir", "campuran huruf, angka, simbol", "123456"], 2, 15),
      q("Kepanjangan CPU adalah…", ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Program Utility"], 1, 20),
    ],
  },
  {
    id: "tpl-dasar-debit-kredit",
    title: "Dasar Debit & Kredit",
    description: "Konsep akuntansi dasar: persamaan akuntansi dan aturan debit-kredit.",
    category: "akuntansi",
    level: "menengah",
    featured: false,
    questions: [
      q("Persamaan dasar akuntansi adalah…", ["Harta = Utang + Modal", "Utang = Modal", "Modal = Harta + Utang", "Harta = Modal − Utang"], 0, 25),
      q("Peningkatan kas dicatat di sisi…", ["Debit", "Kredit", "Saldo", "Laba"], 0, 20),
      q("Akun yang memiliki saldo normal kredit adalah…", ["Kas", "Utang Usaha", "Peralatan", "Piutang"], 1, 25),
      q("Pembelian peralatan tunai berakibat…", ["Kas naik, peralatan naik", "Kas turun, peralatan naik", "Kas naik, utang naik", "Modal turun saja"], 1, 25),
      q("Laporan keuangan yang menunjukkan pendapatan dan beban adalah…", ["Neraca", "Laba Rugi", "Arus Kas", "Perubahan Modal"], 1, 20),
    ],
  },
  {
    id: "tpl-olahraga-dunia",
    title: "Sport Mania",
    description: "Olahraga dunia: aturan dasar, event, dan legenda.",
    category: "olahraga",
    level: "dasar",
    featured: false,
    questions: [
      q("Jumlah pemain satu regu dalam sepak bola?", ["9", "10", "11", "12"], 2, 15),
      q("Olimpiade modern pertama diselenggarakan di…", ["Paris", "Athena", "London", "Roma"], 1, 20),
      q("Olahraga bulu tangkis dimainkan oleh…", ["1 atau 2 pemain per sisi", "3 pemain per sisi", "4 pemain per sisi", "5 pemain per sisi"], 0, 15),
      q("Juara Piala Dunia 2022 adalah…", ["Prancis", "Brasil", "Argentina", "Kroasia"], 2, 20),
      q("Istilah 'slam dunk' berasal dari olahraga…", ["Voli", "Bola basket", "Tenis", "Baseball"], 1, 15),
    ],
  },
  {
    id: "tpl-aku-lebih-pilih",
    title: "Aku Lebih Pilih…",
    description: "Ice breaker ringan: pilih salah satu, lihat seberapa 'normal' kelasmu.",
    category: "icebreaker",
    level: "dasar",
    featured: true,
    questions: [
      q("Lebih pilih…", ["Liburan ke pantai", "Liburan ke gunung", "Tinggal di rumah", "Jalan-jalan kota"], 0, 15),
      q("Sarapan paling pas…", ["Nasi goreng", "Roti bakar", "Bubur ayam", "Tidak sarapan"], 0, 15),
      q("Cuaca paling nyaman…", ["Hujan deras", "Panas cerah", "Berawan sejuk", "Berkabut pagi"], 0, 15),
      q("Belajar paling nyaman…", ["Sendiri, hening", "Grup, ramai", "Sambil dengar musik", "Di kafe"], 0, 15),
      q("Snack film paling wajib…", ["Popcorn manis", "Keripik pedas", "Cokelat", "Es krim"], 0, 15),
    ],
  },
  {
    id: "tpl-trivia-acak",
    title: "Trivia Serba Ada",
    description: "Fakta unik lintas topik untuk menutup kelas dengan seru.",
    category: "trivia",
    level: "dasar",
    featured: false,
    questions: [
      q("Hewan darat tercepat di dunia?", ["Singa", "Cheetah", "Kuda", "Antelop"], 1, 15),
      q("Warna pelangi urutan pertama (dari luar)?", ["Merah", "Biru", "Kuning", "Hijau"], 0, 15),
      q("Benua terluas di dunia adalah…", ["Afrika", "Asia", "Amerika", "Eropa"], 1, 15),
      q("Logam cair pada suhu ruang adalah…", ["Besi", "Raksa", "Tembaga", "Aluminium"], 1, 20),
      q("Alat musik tradisional dari Jawa Barat adalah…", ["Angklung", "Gamelan", "Sasando", "Kolintang"], 0, 20),
      q("Mata uang negara Jepang adalah…", ["Yuan", "Won", "Yen", "Baht"], 2, 15),
    ],
  },
]

/** Satu template berdasarkan id (data penuh — kunci jawaban ikut). */
export function getTemplateById(id) {
  return TEMPLATES.find((template) => template.id === id) || null
}

/**
 * Konversi template → input createQuiz (data LENGKAP, dengan correctIndex).
 * Dijalankan server sebelum menyerahkan hasilnya ke klien lewat API builtin.
 */
export function templateToQuiz(template) {
  return {
    title: template.title,
    description: template.description,
    category: template.category,
    sourceTemplateId: template.id,
    questions: structuredClone(template.questions),
  }
}

/**
 * Sanitasi template untuk tampilan PUBLIK: buang correctIndex, sisakan teks
 * soal + opsi saja. Pratinjau publik tidak boleh menampilkan/menyimpan kunci.
 *
 * Field kartu (rating/usage/estimasi) memakai rumus bersama `summarizeBuiltin`
 * supaya angka di kartu dan halaman detail selalu identik.
 */
export function sanitizeTemplate(template) {
  return {
    ...summarizeBuiltin(template, template.questions.map((question) => question.timeSec)),
    questions: template.questions.map((question) => ({
      text: question.text,
      options: [...question.options],
    })),
  }
}
