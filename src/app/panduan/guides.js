export const GUIDES = [
  {
    slug: "membuat-kuis-pertama",
    title: "Membuat kuis pertama",
    desc: "Dari template kosong sampai siap dibagikan ke peserta.",
    minutes: 4,
    updated: "Diperbarui minggu ini",
    sections: [
      {
        heading: "1. Mulai dari template",
        body: "Buka halaman Buat Kuis, pilih template kosong atau salah satu template siap pakai. Template sudah berisi contoh 8 soal agar tidak mulai dari nol.",
      },
      {
        heading: "2. Isi judul dan soal",
        body: "Ganti judul, tambahkan minimal 1 soal pilihan ganda. Setiap soal butuh teks pertanyaan, 2–4 opsi jawaban, dan satu jawaban benar.",
        list: [
          "Judul minimal 3 karakter, deskripsi opsional.",
          "Tandai satu opsi sebagai jawaban benar.",
          "Gunakan pratinjau untuk cek tampilan peserta.",
        ],
      },
      {
        heading: "3. Simpan dan bagikan",
        body: "Klik Simpan & Bagikan untuk mendapat tautan publik dan kode QR. Tautan ini yang dibagikan ke peserta, bukan URL dashboard.",
      },
      {
        code: "Contoh alur:\nBuat → Isi 3 soal → Simpan → Salin tautan → Kirim ke kelas",
      },
    ],
  },
  {
    slug: "mengelola-template",
    title: "Mengelola template siap pakai",
    desc: "Duplikat, pratinjau, dan sesuaikan template tanpa merusak aslinya.",
    minutes: 3,
    updated: "Diperbarui minggu ini",
    sections: [
      {
        heading: "Duplikat sebelum mengedit",
        body: "Template bersifat read-only. Klik Duplikat untuk membuat salinan yang bisa diedit di dashboard kamu.",
      },
      {
        heading: "Kapan memakai template?",
        list: [
          "Butuh kuis cepat untuk pemanasan kelas.",
          "Ingin contoh struktur soal yang baik.",
          "Mau standarisasi format antar guru.",
        ],
      },
    ],
  },
  {
    slug: "membagikan-dan-menilai",
    title: "Membagikan tautan dan menilai",
    desc: "Cara peserta mengerjakan dan cara membaca nilai otomatis.",
    minutes: 5,
    updated: "Diperbarui minggu ini",
    sections: [
      {
        heading: "Bagikan tautan publik",
        body: "Setiap kuis yang disimpan menghasilkan tautan /main/[id]. Peserta tidak perlu login untuk mengerjakan.",
      },
      {
        heading: "Nilai otomatis",
        body: "Sistem menghitung skor 0–100 dari jawaban benar. Riwayat menyimpan skor, durasi, dan tanggal pengerjaan.",
        list: [
          "Cek menu Riwayat untuk semua percobaan.",
          "Unduh CSV untuk rekap nilai kelas.",
          "Filter berdasarkan tanggal atau skor.",
        ],
      },
    ],
  },
];
