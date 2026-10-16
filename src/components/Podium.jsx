// ═══════════════════════════════════════════════════════════════════════════
// PODIUM — 3 besar dengan blok tinggi berbeda. Diekstrak dari HostClient &
// PlayClient yang sebelumnya menduplikasi markup yang sama.
// CSS murni: .podium / .podium-slot / .podium-block.place-N di globals.css.
// ═══════════════════════════════════════════════════════════════════════════

export function Podium({ rows }) {
  if (!rows || rows.length === 0) return null

  const first = rows.find((row) => row.rank === 1) || rows[0]
  const second = rows.find((row) => row.rank === 2)
  const third = rows.find((row) => row.rank === 3)

  // Urutan tampil: juara 2 (kiri), juara 1 (tengah, lebih tinggi), juara 3 (kanan).
  const slots = [
    second ? { row: second, place: 2, medal: "🥈" } : null,
    { row: first, place: 1, medal: "🥇" },
    third ? { row: third, place: 3, medal: "🥉" } : null,
  ].filter(Boolean)

  return (
    <div className="podium">
      {slots.map(({ row, place, medal }) => (
        <div className="podium-slot" key={row.playerId}>
          <div className="podium-name" title={row.name}>
            {row.name}
          </div>
          <div className="podium-score">{row.score.toLocaleString("id-ID")} poin</div>
          <div className={`podium-block place-${place}`}>
            <span aria-hidden>{medal}</span>
            <span style={{ fontSize: 13, marginTop: 4, opacity: 0.75 }}>#{place}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
