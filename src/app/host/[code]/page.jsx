import HostClient from "./HostClient"

export const metadata = {
  title: "Ruang Host — Yue Quiz",
}

// Next.js 16: `params` & `searchParams` adalah Promise.
// `mode=projector` → prop `projector` untuk layout proyektor (font besar,
// UI minimum). Tidak memakai useSearchParams agar tidak butuh Suspense.
export default async function Page({ params, searchParams }) {
  const [{ code }, resolvedSearch] = await Promise.all([params, searchParams])
  const projector = resolvedSearch?.mode === "projector"
  return <HostClient code={String(code).toUpperCase()} projector={projector} />
}
