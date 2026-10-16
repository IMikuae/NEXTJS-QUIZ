// ═══════════════════════════════════════════════════════════════════════════
// DISTRIBUTION — distribusi jawaban sebagai bar CSS murni.
// Diekstrak dari HostClient. Bar diproporsional terhadap opsi terbanyak
// (bukan total) supaya perbedaan antar opsi terlihat jelas walau pemain sedikit.
// ═══════════════════════════════════════════════════════════════════════════

import { OPTION_LETTERS } from "@/lib/quiz-ui"

export function Distribution({ distribution, options, correctIndex, projector = false }) {
  const total = distribution.reduce((sum, n) => sum + n, 0)
  const max = Math.max(1, ...distribution)

  return (
    <div className="distribution">
      {options.map((option, index) => {
        const count = distribution[index] ?? 0
        const width = Math.round((count / max) * 100)
        const isCorrect = index === correctIndex
        return (
          <div className={`dist-row${isCorrect ? " is-correct" : ""}`} key={index}>
            <div className="dist-label">
              <span className={`dist-label-text${projector ? " projector-opt" : ""}`}>
                <span className="mono">{OPTION_LETTERS[index]}.</span> {option}
                {isCorrect && <span className="correct-tag">Benar</span>}
              </span>
              <span className="dist-label-count">
                {count} suara
                {total > 0 ? ` · ${Math.round((count / total) * 100)}%` : ""}
              </span>
            </div>
            <div className="dist-track">
              <div
                className={`dist-fill${isCorrect ? " is-correct" : ""}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
