"use client";
import Link from "next/link";

export default function PanduanClient({ guides }) {
  return (
    <div className="guide-layout">
      <aside className="guide-side" aria-label="Daftar panduan">
        <p className="guide-side-title">Semua panduan</p>
        <nav className="guide-side-nav">
          {(guides || []).map((g) => (
            <Link key={g.slug} className="guide-side-link" href={`/panduan/${g.slug}`}>
              <span className="guide-side-link-title">{g.title}</span>
              <span className="guide-side-link-meta">{g.minutes} mnt</span>
            </Link>
          ))}
        </nav>
        <Link className="btn btn-ghost guide-side-cta" href="/bantuan">
          Butuh bantuan?
        </Link>
      </aside>
      <div className="guide-grid">
        {(guides || []).map((g) => (
          <Link key={g.slug} className="guide-card card" href={`/panduan/${g.slug}`}>
            <p className="guide-card-kicker">{g.minutes} menit · {g.updated}</p>
            <h2 className="guide-card-title">{g.title}</h2>
            <p className="guide-card-desc">{g.desc}</p>
            <span className="guide-card-link">Baca panduan →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
