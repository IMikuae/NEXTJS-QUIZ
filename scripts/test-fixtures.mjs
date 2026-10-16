// ═══════════════════════════════════════════════════════════════════════════
// TEST FIXTURES — data uji yang dipakai lintas berkas uji
// ═══════════════════════════════════════════════════════════════════════════

/** Soal uji standar: 3 soal, kunci 0 / 1 / 2. */
export function examQuestions() {
  return [
    {
      text: "Soal satu",
      options: ["benar", "salah", "salah", "salah"],
      correctIndex: 0,
      timeSec: 20,
      image: null,
      optionImages: [null, null, null, null],
      explanation: "Penjelasan satu.",
    },
    {
      text: "Soal dua",
      options: ["salah", "benar", "salah", "salah"],
      correctIndex: 1,
      timeSec: 20,
      image: null,
      optionImages: [null, null, null, null],
      explanation: "Penjelasan dua.",
    },
    {
      text: "Soal tiga",
      options: ["salah", "salah", "benar", "salah"],
      correctIndex: 2,
      timeSec: 20,
      image: null,
      optionImages: [null, null, null, null],
      explanation: "Penjelasan tiga.",
    },
  ]
}
