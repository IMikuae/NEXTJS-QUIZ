// ═══════════════════════════════════════════════════════════════════════════
// EMPTY STATE — ilustrasi teks + CTA untuk kondisi kosong.
// ═══════════════════════════════════════════════════════════════════════════
import { InboxIcon } from "@/components/HomeIcons"

export function EmptyState({ icon, title, description, children }) {
  return (
    <div className="empty-state">
      <p className="empty-icon" aria-hidden>
        {icon === undefined || icon === null ? <InboxIcon size={38} /> : icon}
      </p>
      <h3 className="empty-title">{title}</h3>
      {description ? <p className="empty-desc">{description}</p> : null}
      {children ? <div className="btn-row" style={{ justifyContent: "center", marginTop: 8 }}>{children}</div> : null}
    </div>
  )
}
