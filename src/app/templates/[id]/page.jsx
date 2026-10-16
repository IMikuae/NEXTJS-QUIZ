import Link from "next/link"
import { notFound } from "next/navigation"
import { TemplateDetailClient } from "./TemplateDetailClient"
import { sanitizeTemplate, getTemplateById } from "@/lib/templates-data.server"

export const metadata = {
  title: "Detail Template — Yue Quiz",
}

// ═══════════════════════════════════════════════════════════════════════════
// DETAIL TEMPLATE — SERVER COMPONENT.
//
// DUA SUMBER, satu halaman (CONTRACT §5):
//   1. Template BAWAAN (id berupa slug, mis. "tpl-perkalian-cepat") — dibaca
//      dari templates-data lalu DISANITASI di server: `correctIndex` dibuang
//      sebelum dikirim ke klien.
//   2. Template SERVER (id angka) — hanya ringkasan yang diteruskan; data
//      lengkapnya di-fetch komponen klien lewat GET /api/templates/[id], yang
//      sudah menegakkan aturan pemilik ("mine") dan TIDAK mengirim kunci
//      jawaban untuk template privat milik orang lain.
//
// Halaman ini sengaja TIDAK memanggil API dari server: cookie sesi pengunjung
// lebih aman dibaca di klien, dan aturan anti-bocor tetap ditegakkan API.
// ═══════════════════════════════════════════════════════════════════════════

export default async function Page({ params, searchParams }) {
  const [{ id }, resolvedSearch] = await Promise.all([params, searchParams])
  const key = String(id)

  // ?use=1 (dari tombol "Gunakan Template" di kartu) → langsung salin ke draft.
  const autoUse = resolvedSearch?.use === "1"

  const builtin = getTemplateById(key)

  if (builtin) {
    const safe = sanitizeTemplate(builtin)
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
          <div className="glow-blob glow-violet" />
        </div>

        <p style={{ marginBottom: 10 }}>
          <Link href="/templates" className="link">← Kembali ke Template Library</Link>
        </p>

        <TemplateDetailClient
          template={{ ...safe, source: "builtin" }}
          autoUse={autoUse}
        />
      </main>
    )
  }

  if (/^\d+$/.test(key)) {
    return (
      <main className="page page-narrow">
        <div aria-hidden className="glow-field">
          <div className="glow-blob glow-indigo" />
          <div className="glow-blob glow-violet" />
        </div>

        <p style={{ marginBottom: 10 }}>
          <Link href="/templates" className="link">← Kembali ke Template Library</Link>
        </p>

        <TemplateDetailClient
          template={{ id: Number(key), source: "remote", title: "", description: "", questions: [] }}
          autoUse={false}
        />
      </main>
    )
  }

  notFound()
}
