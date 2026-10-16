// ═══════════════════════════════════════════════════════════════════════════
// PLAYER CHIPS — chip pemain dengan warna deterministik dari hash nama.
// Hue dikirim sebagai CSS custom property --chip-hue; CSS yang memakai
// hsl(var(--chip-hue) …). Fungsi murni → server & klien hasil sama (aman SSR).
// ═══════════════════════════════════════════════════════════════════════════

import { chipHueFor } from "@/lib/colors"

export function PlayerChips({ players = [], answeredIds = null, youId = null }) {
  if (players.length === 0) return null

  return (
    <div className="player-grid">
      {players.map((player) => {
        const answered = answeredIds ? answeredIds.includes(player.id) : null
        const isYou = youId != null && player.id === youId
        const classes = ["player-chip", "player-chip-colored"]
        if (answered === true) classes.push("is-answered")
        if (isYou) classes.push("is-you")

        return (
          <span
            className={classes.filter(Boolean).join(" ")}
            key={player.id}
            style={{ "--chip-hue": chipHueFor(player.name) }}
          >
            <span className="player-avatar" aria-hidden>
              {player.name.charAt(0).toUpperCase()}
            </span>
            {player.name}
            {answered === true && (
              <span className="chip-mark" aria-hidden>✓</span>
            )}
          </span>
        )
      })}
    </div>
  )
}
