import MyQuizzesClient from "./MyQuizzesClient"

// Render per-request: halaman ini harus dinamis agar middleware dapat
// menempelkan nonce CSP ke script inline milik Next (CSP berbasis nonce
// menonaktifkan optimasi statis). Shell-nya tetap murah — data tetap diambil
// di klien lewat /api/auth/me.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Kuis Saya — Yue Quiz",
}

export default function Page() {
  return <MyQuizzesClient />
}
