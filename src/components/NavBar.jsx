"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth-store"
import { chipHueFor } from "@/lib/colors"
import { PlusIcon } from "@/components/HomeIcons"

// ═══════════════════════════════════════════════════════════════════════════
// NAVBAR — brand Yue Quiz + link utama + CTA "Buat" + profil.
// Disembunyikan di halaman host/play (layar permainan & proyektor).
// Profil hanya dirender setelah auth selesai dimuat (`loaded`) agar markup
// server & klien identik saat hydration.
//
// Di layar <768px link utama tidak muat; dulu link itu hanya disembunyikan
// sehingga pengguna HP kehilangan akses ke Template / Kuis Saya. Sekarang ada
// tombol hamburger yang membuka drawer berisi link yang sama.
// ═══════════════════════════════════════════════════════════════════════════

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/templates", label: "Template" },
  { href: "/my-quizzes", label: "Kuis Saya" },
  { href: "/riwayat", label: "Riwayat" },
]

export function NavBar() {
  const pathname = usePathname()
  const { user, loaded } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Tutup drawer lewat handler klik link (bukan effect yang mengamati pathname):
  // setiap tautan di drawer memanggil ini, jadi drawer selalu tertutup saat
  // navigasi terjadi tanpa perlu setState di dalam effect.
  const closeMenu = () => setMenuOpen(false)

  // Kunci scroll body selagi drawer terbuka + tutup dengan Esc.
  useEffect(() => {
    if (!menuOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (event) => {
      if (event.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener("keydown", onKey)
    }
  }, [menuOpen])

  // Host & play = layar permainan: tanpa navbar supaya fokus & aman proyektor.
  const isGame = pathname.startsWith("/host/") || pathname.startsWith("/play/")
  if (isGame) return null

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)

  return (
    <header className="nav">
      <div className="nav-inner">
        <button
          type="button"
          className="nav-burger"
          aria-label={menuOpen ? "Tutup menu" : "Buka menu"}
          aria-expanded={menuOpen}
          aria-controls="nav-mobile-drawer"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden className={`nav-burger-icon${menuOpen ? " is-open" : ""}`} />
        </button>

        <Link href="/" className="nav-brand">
          <span className="brand-dot" aria-hidden />
          Yue Quiz
        </Link>

        <nav className="nav-links" aria-label="Navigasi utama">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link${isActive(link.href) ? " is-active" : ""}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="nav-cta">
          <Link href="/editor/new" className="btn btn-primary btn-sm">
            <PlusIcon size={16} aria-hidden />
            Buat Quiz
          </Link>

          {loaded &&
            (user ? (
              <Link
                href="/masuk"
                className="nav-profile"
                title={`Profil: ${user.name}`}
                aria-label={`Profil ${user.name}`}
              >
                <span className="player-avatar" style={{ "--chip-hue": chipHueFor(user.name) }} aria-hidden>
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="nav-profile-name">{user.name}</span>
              </Link>
            ) : (
              <Link href="/masuk" className="btn btn-sm btn-ghost nav-login">
                Masuk
              </Link>
            ))}
        </div>
      </div>

      {menuOpen && (
        <div className="nav-drawer-backdrop" onClick={() => setMenuOpen(false)} aria-hidden />
      )}
      <nav
        id="nav-mobile-drawer"
        className={`nav-drawer${menuOpen ? " is-open" : ""}`}
        aria-label="Navigasi mobile"
        aria-hidden={!menuOpen}
      >
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`nav-drawer-link${isActive(link.href) ? " is-active" : ""}`}
            tabIndex={menuOpen ? 0 : -1}
            onClick={closeMenu}
          >
            {link.label}
          </Link>
        ))}
        <Link
          href="/editor/new"
          className="btn btn-primary nav-drawer-cta"
          tabIndex={menuOpen ? 0 : -1}
          onClick={closeMenu}
        >
          <PlusIcon size={16} aria-hidden />
          Buat Quiz
        </Link>

        {/* Tamu kehilangan tombol "Masuk" di mobile (tombol navbar
            disembunyikan <768px). Sediakan pintu masuknya di drawer. */}
        {loaded && !user && (
          <Link
            href="/masuk"
            className="btn btn-ghost nav-drawer-cta"
            tabIndex={menuOpen ? 0 : -1}
            onClick={closeMenu}
          >
            Masuk / Daftar
          </Link>
        )}
      </nav>
    </header>
  )
}
