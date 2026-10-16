import MasukClient from "./MasukClient"

// Render per-request: halaman ini harus dinamis agar middleware dapat
// menempelkan nonce CSP ke script inline milik Next (CSP berbasis nonce
// menonaktifkan optimasi statis). Shell-nya tetap murah — data tetap diambil
// di klien lewat /api/auth/me.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Masuk — Yue Quiz",
  description: "Masuk atau buat profil lokal Yue Quiz untuk menyimpan quiz di perangkat ini.",
}

export default function Page() {
  return <MasukClient />
}
