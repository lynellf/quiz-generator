import { createFileRoute } from '@tanstack/react-router'
import { QuizApp } from '#/features/quiz/QuizApp'

type SearchState = {
  quizId?: string
  attemptId?: string
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): SearchState => ({
    quizId: typeof search.quizId === 'string' ? search.quizId : undefined,
    attemptId: typeof search.attemptId === 'string' ? search.attemptId : undefined,
  }),
  component: IndexRoute,
})

function IndexRoute() {
  const search = Route.useSearch()
  return <QuizApp search={search} />
}
