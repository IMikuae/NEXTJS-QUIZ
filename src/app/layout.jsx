import { NavBar } from "@/components/NavBar"
import { ToastHost } from "@/components/ToastHost"
// Urutan import MENENTUKAN cascade: base dulu, lalu komponen dasar, lalu
// fitur (matematika/editor/host/ujian). Jangan diacak.
import "./globals.css"
import "./styles/01-components.css"
import "./styles/02-features.css"
import "./styles/03-home.css"

export const metadata = {
  title: "Yue Quiz — buat, temukan, dan mainkan quiz interaktif",
  description:
    "Buat quiz sendiri, gunakan template siap pakai, atau langsung gabung lewat kode 6 huruf. Kuis multiplayer real-time dengan skor kecepatan.",
  robots: { index: false, follow: false },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
}

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <NavBar />
        {children}
        <ToastHost />
      </body>
    </html>
  )
}
