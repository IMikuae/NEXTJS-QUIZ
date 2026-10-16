import EditorClient from "./EditorClient"

export const metadata = {
  title: "Quiz Editor — Yue Quiz",
}

// Next.js 16: params Promise → page async, meneruskan quizId ke komponen klien.
export default async function Page({ params }) {
  const { quizId } = await params
  return <EditorClient quizId={String(quizId)} />
}
