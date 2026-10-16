import TemplatesClient from "./TemplatesClient"

export const metadata = {
  title: "Template Library — Yue Quiz",
  description:
    "Temukan quiz siap pakai: matematika, bahasa Inggris, IPA, trivia, dan lainnya. Edit sesuai kebutuhanmu, lalu langsung mainkan.",
}

export default async function Page({ searchParams }) {
  const resolved = await searchParams
  const initialTab = resolved?.mine === "1" ? "mine" : "explore"
  return <TemplatesClient initialTab={initialTab} />
}
