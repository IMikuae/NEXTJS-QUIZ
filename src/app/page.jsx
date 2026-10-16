import HomeClient from "./HomeClient"

// Render per-request: halaman ini harus dinamis agar middleware dapat
// menempelkan nonce CSP ke script inline milik Next (CSP berbasis nonce
// menonaktifkan optimasi statis). Shell-nya tetap murah — data tetap diambil
// di klien lewat /api/auth/me.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Yue Quiz — buat, temukan, dan mainkan quiz",
  description:
    "Buat quiz dari nol, gunakan template siap pakai, atau gabung lewat kode 6 huruf. Real-time, tanpa aplikasi tambahan.",
}

export default function Page() {
  return <HomeClient />
}
