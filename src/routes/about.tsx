import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="rounded-[2rem] border border-border/70 bg-card/92 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        <p className="island-kicker mb-2">About</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          A study tool built around grounded review.
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
          This app turns your own source documents into quizzes, stores normalized text in Postgres, and
          keeps question citations attached to persisted chunks so you can review the evidence behind each
          answer later.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <InfoCard title="Upload pipeline" body="Markdown, HTML, plaintext, and PDF uploads are normalized into chunked text with offsets." />
          <InfoCard title="Generation" body="Quiz generation runs server-side through OpenRouter with a strict JSON contract." />
          <InfoCard title="Review" body="Submitted answers can be checked against saved excerpts with highlighted source text." />
        </div>
      </section>
    </main>
  )
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-2xl border border-border bg-muted/30 p-4">
      <h2 className="m-0 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 mb-0 text-sm leading-7 text-muted-foreground">{body}</p>
    </article>
  )
}
