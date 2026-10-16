const ITEMS = [
  {
    q: "Apakah peserta harus daftar akun?",
    a: "Tidak. Tautan publik /main/[id] bisa dibuka siapa pun tanpa login. Akun hanya dibutuhkan pembuat kuis untuk menyimpan dan melihat riwayat.",
  },
  {
    q: "Berapa soal minimal agar kuis bisa disimpan?",
    a: "Minimal 1 soal pilihan ganda yang valid: ada teks pertanyaan, minimal 2 opsi, dan satu jawaban benar yang ditandai.",
  },
  {
    q: "Bagaimana cara menilai ulang atau melihat skor lama?",
    a: "Buka menu Riwayat. Setiap percobaan menyimpan skor, durasi, dan tanggal. Kamu bisa menyaring dan mengunduh rekap dalam format CSV.",
  },
  {
    q: "Tautan kuis tidak bisa dibuka, apa yang terjadi?",
    a: "Pastikan kuis sudah disimpan (bukan draf), tidak dihapus dari dashboard, dan kamu membagikan tautan publik, bukan tautan /dashboard atau /buat.",
  },
];

export default function HelpContent() {
  return (
    <div className="help-list">
      {ITEMS.map((it, i) => (
        <details key={i} className="help-item card">
          <summary className="help-q">{it.q}</summary>
          <p className="help-a">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
