import { Link } from '@tanstack/react-router'
import ThemeToggle from '#/components/ThemeToggle'

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-xl">
      <nav className="page-wrap flex flex-wrap items-center gap-3 py-3 sm:py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink)] no-underline shadow-[0_12px_32px_rgba(113,76,35,0.12)]"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,#f59e0b,#ef4444)]" />
          Quiz Generator
        </Link>

        <div className="order-3 flex w-full items-center gap-4 text-sm font-semibold sm:order-2 sm:w-auto sm:ml-2">
          <Link to="/" className="nav-link" activeProps={{ className: 'nav-link is-active' }}>
            Workspace
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </nav>
    </header>
  )
}
