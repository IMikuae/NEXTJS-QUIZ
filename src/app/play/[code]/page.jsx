import PlayClient from "./PlayClient"

export const metadata = {
  title: "Main — Live Quiz",
}

// Next.js 16: `params` adalah Promise, jadi page ini async dan meng-await-nya.
export default async function Page({ params }) {
  const { code } = await params
  return <PlayClient code={String(code).toUpperCase()} />
}
