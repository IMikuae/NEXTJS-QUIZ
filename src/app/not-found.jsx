import Link from "next/link"

// Render per-request: halaman ini harus dinamis agar middleware dapat
// menempelkan nonce CSP ke script inline milik Next (CSP berbasis nonce
// menonaktifkan optimasi statis). Shell-nya tetap murah — data tetap diambil
// di klien lewat /api/auth/me.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Halaman tidak ditemukan — Yue Quiz",
}

export default function NotFound() {
  return (
    <main className="page page-narrow">
      <div aria-hidden className="glow-field">
        <div className="glow-blob glow-indigo" />
        <div className="glow-blob glow-violet" />
      </div>

      <div className="card center" style={{ marginTop: 60 }}>
        <p className="mono" style={{ fontSize: 48, fontWeight: 800, margin: 0, color: "var(--text-secondary)" }}>
          404
        </p>
        <h1 className="card-title" style={{ marginTop: 16 }}>
          Halaman tidak ditemukan
        </h1>
        <p className="card-hint" style={{ marginBottom: 24 }}>
          Alamat yang kamu buka tidak ada atau sudah dipindahkan.
        </p>
        <div className="btn-row" style={{ justifyContent: "center" }}>
          <Link href="/" className="btn btn-primary">
            Ke halaman utama
          </Link>
          <Link href="/templates" className="btn">
            Jelajahi Template
          </Link>
        </div>
      </div>
    </main>
  )
}
