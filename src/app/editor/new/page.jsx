import EditorEntryClient from "./EditorEntryClient"

export const metadata = {
  title: "Buat Quiz — Yue Quiz",
}

// ═══════════════════════════════════════════════════════════════════════════
// /editor/new — pintu masuk editor:
//   • ?from=<templateId>    → clone template BAWAAN (templates-data) → editor
//   • ?template=<id>        → clone template SERVER (POST …/clone) → editor
//   • ?mode=import          → ImportWizard (tempel teks/CSV)
//   • tanpa query           → draft kosong, redirect editor
// searchParams di-await (Next 16) lalu diteruskan sebagai prop sederhana.
// ═══════════════════════════════════════════════════════════════════════════

export default async function Page({ searchParams }) {
  const resolved = await searchParams
  const from = typeof resolved?.from === "string" ? resolved.from : null
  const template =
    typeof resolved?.template === "string" && resolved.template.length > 0
      ? resolved.template
      : null
  const mode = resolved?.mode === "import" ? "import" : "normal"
  return <EditorEntryClient from={from} mode={mode} template={template} />
}
