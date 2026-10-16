// ═══════════════════════════════════════════════════════════════════════════
// TOAST STORE — notifikasi global (success/info/warning/error)
// ═══════════════════════════════════════════════════════════════════════════
// Pola pub/sub sederhana: komponen apa pun memanggil toast.success(...) tanpa
// perlu tahu siapa yang merender. ToastHost (dipasang di layout) berlangganan
// via useSyncExternalStore dan merender semua toast aktif.
//
// Snapshot selalu array BARU (immutable) supaya useSyncExternalStore mendeteksi
// perubahan. Auto-dismiss ditangani ToastHost per toast (durationMs).
// ═══════════════════════════════════════════════════════════════════════════

const MAX_TOASTS = 4
const DEFAULT_DURATION_MS = 4200

/** @type {Array<{ id: number, type: string, title: string, message: string, createdAt: number, durationMs: number }>} */
let toasts = []
/** @type {Set<() => void>} */
const listeners = new Set()
let nextId = 1

function emit() {
  // Salin supaya snapshot tidak pernah berubah-ubah di tempat.
  const snapshot = [...toasts]
  for (const listener of listeners) listener(snapshot)
}

/**
 * @param {(snapshot: any[]) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeToasts(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Snapshot immutable untuk useSyncExternalStore (getSnapshot). */
export function getToastSnapshot() {
  return toasts
}

/**
 * Tambah satu toast. Melebihi MAX_TOASTS → toast terlama dibuang.
 * @param {{ type?: "success"|"info"|"warning"|"error", title: string, message?: string, durationMs?: number }} input
 * @returns {number} id toast
 */
export function pushToast({ type = "info", title, message = "", durationMs = DEFAULT_DURATION_MS }) {
  const id = nextId
  nextId += 1
  toasts = [...toasts, { id, type, title, message, createdAt: Date.now(), durationMs }]
  if (toasts.length > MAX_TOASTS) toasts = toasts.slice(toasts.length - MAX_TOASTS)
  emit()
  return id
}

/** Hapus satu toast berdasarkan id (dipanggil ToastHost saat timeout / tombol tutup). */
export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

/** Helper ringkas: toast.success("Judul", "Detail opsional"). */
export const toast = {
  success: (title, message) => pushToast({ type: "success", title, message }),
  info: (title, message) => pushToast({ type: "info", title, message }),
  warning: (title, message) => pushToast({ type: "warning", title, message }),
  error: (title, message) => pushToast({ type: "error", title, message }),
}
