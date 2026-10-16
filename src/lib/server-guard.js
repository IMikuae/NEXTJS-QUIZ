// ═══════════════════════════════════════════════════════════════════════════
// SERVER GUARD — penjaga ringan "modul ini TIDAK boleh masuk bundel klien".
// ═══════════════════════════════════════════════════════════════════════════
// Dipakai oleh modul yang memuat DATA SENSITIF (mis. kunci jawaban template).
// Bila salah satu komponen "use client" keliru mengimpor modul tersebut,
// evaluasi modul ini di peramban akan melempar SEBELUM data sensitif
// ter-bundle. Tanpa dependensi (proyek ini sengaja nol dependensi tambahan,
// jadi tidak memakai paket `server-only`).
// ═══════════════════════════════════════════════════════════════════════════

if (typeof window !== "undefined") {
  throw new Error(
    "Modul server-only diimpor ke bundel klien. Data kunci jawaban tidak boleh ikut ke peramban."
  )
}

export {}
