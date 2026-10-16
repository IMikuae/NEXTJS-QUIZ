"use client"

import { MathText } from "@/components/MathText"
import { StatTile } from "@/components/StatTile"

// ═══════════════════════════════════════════════════════════════════════════
// HOST REPORT — metrik keseluruhan + akurasi per soal + Export CSV.
// Data dari state.report (publicState, host-only, fase finished).
// CSV: pemisah ";" + escape teks + BOM UTF-8 agar Excel Windows langsung benar.
// ═══════════════════════════════════════════════════════════════════════════

function csvEscape(value) {
  const text = String(value ?? "")
  if (text.includes('"') || text.includes(";") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(report, code) {
  const rows = [
    ["No", "Soal", "Dijawab", "Benar", "Persen"].join(";"),
    ...report.perQuestion.map((q) =>
      [q.index + 1, csvEscape(q.text), q.answeredCount, q.correctCount, `${q.correctPercent}%`].join(";")
    ),
  ]
  const csv = `﻿${rows.join("\r\n")}`
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `yue-quiz-${code}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function HostReport({ report, code }) {
  if (!report) {
    return (
      <div className="card">
        <h2 className="card-title">Report</h2>
        <p className="card-hint">Report belum tersedia.</p>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div className="counter-row" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
        <h2 className="card-title" style={{ margin: 0 }}>Quiz Report</h2>
        <button type="button" className="btn btn-sm" onClick={() => downloadCsv(report, code)}>
          ⬇ Export CSV
        </button>
      </div>

      <div className="metrics-grid" style={{ marginTop: 14 }}>
        <StatTile value={report.totalPlayers} label="Total pemain" />
        <StatTile value={report.totalQuestions} label="Total soal" />
        <StatTile value={report.averageScore.toLocaleString("id-ID")} label="Rata-rata skor" />
        <StatTile value={`${report.accuracyPercent}%`} label="Akurasi keseluruhan" />
      </div>

      <h3 className="filter-group-title" style={{ marginTop: 22 }}>Akurasi per soal</h3>
      {report.perQuestion.map((q) => (
        <div className="report-row" key={q.index}>
          <span className="question-number">{String(q.index + 1).padStart(2, "0")}</span>
          <div style={{ minWidth: 0 }}>
            <span className="qlist-text" style={{ display: "block", color: "var(--text-primary)", fontSize: 14 }}>
              <MathText text={q.text} />
              {q.skipped && <span className="tpl-badge is-warn" style={{ marginLeft: 8 }}>Dilewati</span>}
            </span>
            <div className="report-bar">
              <div
                className={`report-bar-fill${q.correctPercent < 50 ? " is-low" : ""}`}
                style={{ width: `${q.correctPercent}%` }}
              />
            </div>
          </div>
          <span className="pct-big" style={{ color: q.correctPercent >= 50 ? "var(--success)" : "#fca5a5" }}>
            {q.correctPercent}% benar
            <br />
            <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)" }}>
              {q.correctCount}/{q.answeredCount} pemain
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
