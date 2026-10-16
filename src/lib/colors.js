// ═══════════════════════════════════════════════════════════════════════════
// COLORS — hue deterministik dari nama pemain.
// Fungsi murni tanpa akses storage/random → hasil server & klien SAMA,
// jadi aman untuk hydration (dipakai PlayerChips via CSS custom property).
// ═══════════════════════════════════════════════════════════════════════════

/** Hash string → integer 32-bit (FNV-1a sederhana). */
export function hashString(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Hue 0–359 deterministik dari nama — dua nama berbeda cenderung beda warna. */
export function chipHueFor(name) {
  return hashString(String(name ?? "").toLowerCase()) % 360
}
