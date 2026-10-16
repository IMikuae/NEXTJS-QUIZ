// ═══════════════════════════════════════════════════════════════════════════
// STAT TILE — tile metrik kecil (report host, lobby, halaman detail).
// ═══════════════════════════════════════════════════════════════════════════

export function StatTile({ value, label }) {
  return (
    <div className="stat-card">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
