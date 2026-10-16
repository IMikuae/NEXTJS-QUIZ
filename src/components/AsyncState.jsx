// ═══════════════════════════════════════════════════════════════════════════
// ASYNC STATE — komponen bersama untuk kondisi "memuat" & "gagal"
// ═══════════════════════════════════════════════════════════════════════════
// Sebelumnya setiap halaman menulis sendiri <div className="waiting"> dan
// <div className="alert alert-error"> dengan gaya yang sedikit berbeda. Dua
// komponen ini menyatukannya supaya loading/error terlihat konsisten di
// seluruh aplikasi.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Indikator memuat.
 * @param {{ label?: string, inline?: boolean, marginTop?: number }} props
 *   `inline` → tanpa bungkus <main>, untuk dipakai di dalam kartu.
 */
export function LoadingState({ label = "Memuat…", inline = false, marginTop }) {
  const body = (
    <div className="waiting" role="status" aria-live="polite" style={marginTop ? { marginTop } : undefined}>
      <span className="spinner" aria-hidden /> {label}
    </div>
  )
  return inline ? body : <main className="page page-narrow">{body}</main>
}

/**
 * Kotak pesan galat.
 * @param {{ message: string, onRetry?: () => void, marginTop?: number }} props
 */
export function ErrorState({ message, onRetry, marginTop }) {
  if (!message) return null
  return (
    <div
      className="alert alert-error"
      role="alert"
      style={{ marginTop, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
    >
      <span style={{ flex: 1, minWidth: 160 }}>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          ⟳ Coba lagi
        </button>
      ) : null}
    </div>
  )
}
