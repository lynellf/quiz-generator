export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="site-footer mt-20 px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col gap-4 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
        <div>
          <p className="m-0 text-sm font-medium text-[var(--sea-ink)]">Quiz Generator</p>
          <p className="m-0 mt-1 text-sm">
            Build quizzes from your own documents and review each answer against saved source excerpts.
          </p>
        </div>
        <div className="text-sm">
          <p className="m-0">&copy; {year} Quiz Generator</p>
          <p className="island-kicker mt-2">TanStack Start + OpenRouter + Postgres</p>
        </div>
      </div>
    </footer>
  )
}
