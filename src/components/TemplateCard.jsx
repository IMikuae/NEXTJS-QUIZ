"use client"

import Link from "next/link"
import { CATEGORY_MAP } from "@/lib/templates-data"
import {
  BoltIcon,
  BookIcon,
  BulbIcon,
  ChartIcon,
  ClockIcon,
  SparkIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
} from "@/components/HomeIcons"

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE CARD — kartu template dengan thumbnail gradien kategori.
// HANYA menerima data tersanitasi (TEMPLATE_INDEX) — tanpa correctIndex.
// Thumbnail memakai ikon SVG inline (bukan emoji) supaya tidak jadi kotak
// di perangkat tanpa font emoji. CATEGORY_MAP.icon tetap ada sebagai data,
// tapi tidak dirender.
// ═══════════════════════════════════════════════════════════════════════════

// Peta kategori → ikon SVG. Diekspor supaya halaman lain (filter chip di
// /templates) memakai ikon yang sama tanpa menduplikasi peta.
export const CATEGORY_ICONS = {
  matematika: ChartIcon,
  binggris: BookIcon,
  ipa: BulbIcon,
  ips: UsersIcon,
  sejarah: ClockIcon,
  teknologi: BoltIcon,
  akuntansi: ChartIcon,
  olahraga: BoltIcon,
  umum: BulbIcon,
  icebreaker: SparkIcon,
  trivia: StarIcon,
}

export function CategoryThumb({ category, icon }) {
  if (icon && typeof icon !== "string") {
    return (
      <div className={`cat-thumb cat-${category}`} aria-hidden>
        {icon}
      </div>
    )
  }
  const Icon = CATEGORY_ICONS[category] || BulbIcon
  return (
    <div className={`cat-thumb cat-${category}`} aria-hidden>
      <Icon size={36} />
    </div>
  )
}

export function TemplateCard({ template }) {
  const category = CATEGORY_MAP[template.category]
  const levelLabel = template.level === "menengah" ? "Menengah" : "Mudah"

  return (
    <article className="tpl-card">
      <Link
        href={`/templates/${template.id}`}
        style={{ display: "block", textDecoration: "none" }}
        aria-label={`Lihat detail template ${template.title}`}
      >
        <CategoryThumb category={template.category} />
      </Link>
      <div className="tpl-card-body">
        <h3 className="tpl-title">
          <Link
            href={`/templates/${template.id}`}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            {template.title}
          </Link>
        </h3>
        <div className="tpl-meta">
          {category ? <span className="tpl-meta-item">{category.label}</span> : null}
          <span className="tpl-meta-item"><StarIcon size={14} aria-hidden /> {template.rating.toFixed(1)}</span>
          <span className="tpl-meta-dot" aria-hidden>•</span>
          <span className="tpl-meta-item">{template.questionCount} soal</span>
          <span className="tpl-meta-item"><ClockIcon size={14} aria-hidden /> {template.estimatedTimeMin} menit</span>
        </div>
        <div className="tpl-meta">
          <span className="tpl-badge">{levelLabel}</span>
          <span className="tpl-meta-item"><UserIcon size={14} aria-hidden /> {template.author}</span>
        </div>
        <div className="tpl-actions">
          <Link href={`/templates/${template.id}`} className="btn btn-sm btn-ghost">
            Preview
          </Link>
          <Link
            href={`/templates/${template.id}?use=1`}
            className="btn btn-sm btn-primary"
            style={{ flex: 1 }}
          >
            Gunakan Template
          </Link>
        </div>
      </div>
    </article>
  )
}
