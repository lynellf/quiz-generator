import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { BookOpenText, CheckCircle2, FileText, LoaderCircle, Sparkles } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { generateQuiz, getAttempt, getQuiz, submitQuiz } from '#/features/quiz/server'
import type { AttemptRecord, CitationRecord, QuizRecord } from '#/features/quiz/types'

type SearchState = {
  quizId?: string
  attemptId?: string
}

type UploadDraft = {
  file: File
  displayName: string
}

export function QuizApp({ search }: { search: SearchState }) {
  const navigate = useNavigate({ from: '/' })
  const [uploads, setUploads] = useState<UploadDraft[]>([])
  const [totalQuestions, setTotalQuestions] = useState(8)
  const [multipleChoiceRatio, setMultipleChoiceRatio] = useState(75)
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [activeCitation, setActiveCitation] = useState<CitationRecord | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!search.quizId) {
      setQuiz(null)
      setAttempt(null)
      setAnswers({})
      return
    }

    const quizId = Number(search.quizId)
    if (!Number.isInteger(quizId) || quizId <= 0) {
      setError('The quiz id in the URL is invalid.')
      return
    }

    let cancelled = false
    setIsLoadingQuiz(true)
    setError(null)

    getQuiz({ data: { quizId } })
      .then((data) => {
        if (cancelled) {
          return
        }

        setQuiz(data.quiz)
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load quiz')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingQuiz(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [search.quizId])

  useEffect(() => {
    if (!search.quizId || !search.attemptId) {
      setAttempt(null)
      return
    }

    const quizId = Number(search.quizId)
    const attemptId = Number(search.attemptId)
    if (!Number.isInteger(quizId) || !Number.isInteger(attemptId)) {
      setError('The attempt id in the URL is invalid.')
      return
    }

    let cancelled = false
    setError(null)

    getAttempt({ data: { quizId, attemptId } })
      .then((data) => {
        if (cancelled) {
          return
        }

        setAttempt(data.attempt)
        setAnswers(
          Object.fromEntries(
            data.attempt.answers.map((answer) => [answer.questionId, answer.selectedAnswer]),
          ),
        )
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load attempt')
        }
      })

    return () => {
      cancelled = true
    }
  }, [search.attemptId, search.quizId])

  const answeredQuestionCount = useMemo(
    () => (quiz ? quiz.questions.filter((question) => answers[question.id]).length : 0),
    [answers, quiz],
  )

  async function handleGenerateQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (uploads.length === 0) {
      setError('Choose at least one document before generating a quiz.')
      return
    }

    setError(null)
    setIsGenerating(true)

    try {
      const formData = new FormData()
      uploads.forEach((upload) => {
        formData.append('files', upload.file)
      })
      formData.append('displayNames', JSON.stringify(uploads.map((upload) => upload.displayName)))
      formData.append('totalQuestions', String(totalQuestions))
      formData.append('multipleChoiceRatio', String(multipleChoiceRatio))

      const data = await generateQuiz({ data: formData })

      setQuiz(data.quiz)
      setAttempt(null)
      setAnswers({})
      setUploads([])
      await navigate({
        to: '/',
        search: {
          quizId: String(data.quiz.id),
        },
        replace: true,
      })
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate quiz')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmitQuiz() {
    if (!quiz) {
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const data = await submitQuiz({
        data: {
          quizId: quiz.id,
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            selectedAnswer: answers[question.id] ?? '',
          })),
        },
      })

      setAttempt(data.attempt)
      await navigate({
        to: '/',
        search: {
          quizId: String(quiz.id),
          attemptId: String(data.attempt.id),
        },
        replace: true,
      })
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to submit quiz')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <main className="page-wrap px-4 pb-16 pt-10">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-[linear-gradient(140deg,rgba(255,248,240,0.96),rgba(255,255,255,0.85))] px-6 py-8 shadow-[0_30px_90px_rgba(126,86,46,0.12)] sm:px-10 sm:py-12">
          <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(224,134,74,0.18),transparent_58%)]" />
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative">
              <p className="island-kicker mb-3 text-[var(--muted-foreground)]">Document-grounded quiz generation</p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-6xl">
                Turn your notes, PDFs, and docs into cited quizzes.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Upload source material, choose the quiz mix you want, and review every answer against the
                exact excerpt that supported it.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-700">
                <Pill icon={<FileText className="size-4" />}>Markdown, HTML, PDF, and plaintext</Pill>
                <Pill icon={<Sparkles className="size-4" />}>OpenRouter-backed generation</Pill>
                <Pill icon={<BookOpenText className="size-4" />}>Source excerpts with highlighting</Pill>
              </div>
            </div>

            <Card className="border-white/80 bg-white/88 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <CardTitle>Create a new quiz</CardTitle>
                <CardDescription>
                  Source chunks are normalized before generation so citations can point back to persisted text.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleGenerateQuiz}>
                  <div className="space-y-2">
                    <Label htmlFor="files">Upload documents</Label>
                    <Input
                      id="files"
                      type="file"
                      multiple
                      accept=".md,.markdown,.html,.htm,.txt,.text,.pdf,text/plain,text/markdown,text/html,application/pdf"
                      onChange={(event) => {
                        const nextUploads = Array.from(event.target.files ?? []).map((file) => ({
                          file,
                          displayName: removeExtension(file.name),
                        }))
                        setUploads(nextUploads)
                      }}
                    />
                    <p className="text-sm text-muted-foreground">
                      PDFs are reviewed against extracted text rather than original on-page coordinates.
                    </p>
                  </div>

                  {uploads.length > 0 ? (
                    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/40 p-3">
                      {uploads.map((upload, index) => (
                        <div key={`${upload.file.name}-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1.2fr]">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{upload.file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(upload.file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`display-name-${index}`}>Display name</Label>
                            <Input
                              id={`display-name-${index}`}
                              value={upload.displayName}
                              onChange={(event) => {
                                setUploads((current) =>
                                  current.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? { ...entry, displayName: event.target.value }
                                      : entry,
                                  ),
                                )
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="total-questions">Question count</Label>
                      <Input
                        id="total-questions"
                        type="number"
                        min={1}
                        max={25}
                        value={totalQuestions}
                        onChange={(event) => setTotalQuestions(Number(event.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="multiple-choice-ratio">Multiple choice ratio</Label>
                      <Input
                        id="multiple-choice-ratio"
                        type="number"
                        min={0}
                        max={100}
                        value={multipleChoiceRatio}
                        onChange={(event) => setMultipleChoiceRatio(Number(event.target.value))}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-amber-200/70 bg-amber-50/70 p-3 text-sm text-amber-900">
                    With the current settings, the quiz will target{' '}
                    <strong>{Math.round((totalQuestions * multipleChoiceRatio) / 100)}</strong> multiple choice
                    questions and <strong>{totalQuestions - Math.round((totalQuestions * multipleChoiceRatio) / 100)}</strong>{' '}
                    true/false questions.
                  </div>

                  <Button type="submit" className="w-full" size="lg" disabled={isGenerating}>
                    {isGenerating ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" />
                        Generating quiz
                      </>
                    ) : (
                      'Generate quiz'
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>

        {error ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </section>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.88fr_1.12fr]">
          <Card className="border-slate-200/80 bg-white/92">
            <CardHeader>
              <CardTitle>How it works</CardTitle>
              <CardDescription>A grounded flow designed to keep source traceability intact.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-7 text-slate-700">
              <Step number="1" title="Normalize uploads">
                Markdown, HTML, plaintext, and PDFs are reduced into paragraph-aware chunks with stable offsets.
              </Step>
              <Step number="2" title="Generate through OpenRouter">
                The model receives chunk ids and must return strict JSON with question types, answers, and citations.
              </Step>
              <Step number="3" title="Review with evidence">
                Each answer can be opened alongside the chunk text that supported it, with the cited excerpt
                highlighted for faster study review.
              </Step>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.94))]">
            <CardHeader>
              <CardTitle>Current quiz state</CardTitle>
              <CardDescription>
                {quiz
                  ? `Quiz #${quiz.id} is ready with ${quiz.totalQuestions} questions and ${quiz.documents.length} source document${quiz.documents.length === 1 ? '' : 's'}.`
                  : 'Generate a quiz to see stored documents, quiz metadata, and citations here.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoadingQuiz ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  Loading quiz
                </div>
              ) : quiz ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard label="Provider" value={quiz.provider} />
                    <StatCard label="Model" value={quiz.model} />
                    <StatCard label="Multiple choice" value={String(quiz.multipleChoiceCount)} />
                    <StatCard label="True/false" value={String(quiz.trueFalseCount)} />
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-white p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Source documents</h3>
                    <div className="mt-3 space-y-2">
                      {quiz.documents.map((document) => (
                        <div
                          key={document.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{document.displayName}</p>
                            <p className="text-xs text-muted-foreground">{document.originalFileName}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>{document.mimeType}</p>
                            <p>{document.extractionStatus}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {quiz.generationNotes ? (
                      <p className="mt-3 text-xs text-amber-700">{quiz.generationNotes}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-sm text-slate-600">
                  No quiz has been generated yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {quiz ? (
          <section className="mt-10 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="island-kicker mb-2">Quiz</p>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-900">{quiz.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Answered {answeredQuestionCount} of {quiz.questions.length} questions
                </p>
              </div>
              {!attempt ? (
                <Button
                  size="lg"
                  disabled={isSubmitting || answeredQuestionCount !== quiz.questions.length}
                  onClick={handleSubmitQuiz}
                >
                  {isSubmitting ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      Submitting
                    </>
                  ) : (
                    'Submit quiz'
                  )}
                </Button>
              ) : (
                <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">
                  Attempt recorded
                </div>
              )}
            </div>

            <div className="space-y-4">
              {quiz.questions.map((question, index) => {
                const selectedAnswer = answers[question.id] ?? ''
                const reviewAnswer = attempt?.answers.find((answer) => answer.questionId === question.id)

                return (
                  <Card key={question.id} className="border-slate-200/80 bg-white/96">
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle>
                            {index + 1}. {question.prompt}
                          </CardTitle>
                          <CardDescription>
                            {question.questionType === 'multiple_choice' ? 'Multiple choice' : 'True / False'}
                          </CardDescription>
                        </div>
                        {reviewAnswer ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                              reviewAnswer.isCorrect
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            <CheckCircle2 className="size-3.5" />
                            {reviewAnswer.isCorrect ? 'Correct' : 'Review'}
                          </span>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3">
                        {(question.options ?? ['True', 'False']).map((option) => (
                          <label
                            key={option}
                            className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                              selectedAnswer === option
                                ? 'border-amber-400 bg-amber-50'
                                : 'border-slate-200 bg-slate-50/80 hover:border-slate-300'
                            } ${attempt ? 'cursor-default' : ''}`}
                          >
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              value={option}
                              checked={selectedAnswer === option}
                              disabled={Boolean(attempt)}
                              onChange={(event) => {
                                setAnswers((current) => ({
                                  ...current,
                                  [question.id]: event.target.value,
                                }))
                              }}
                            />
                            <span className="text-sm leading-6 text-slate-800">{option}</span>
                          </label>
                        ))}
                      </div>

                      {attempt ? (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-7 text-slate-700">
                          <p className="m-0">
                            <strong>Your answer:</strong> {reviewAnswer?.selectedAnswer}
                          </p>
                          <p className="m-0">
                            <strong>Correct answer:</strong> {question.correctAnswer}
                          </p>
                          <p className="mt-2 mb-0">{question.explanation}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {question.citations.map((citation, citationIndex) => (
                              <Button
                                key={citation.id}
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveCitation(citation)}
                              >
                                View source {citationIndex + 1}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </section>
        ) : null}

        {quiz && attempt ? (
          <section className="mt-10">
            <Card className="border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,250,240,0.95),rgba(255,255,255,0.92))]">
              <CardHeader>
                <CardTitle>Results</CardTitle>
                <CardDescription>
                  Submitted on {new Date(attempt.submittedAt).toLocaleString()} with grounded source citations.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Score" value={`${attempt.scorePercent}%`} />
                <StatCard label="Correct answers" value={String(attempt.correctAnswers)} />
                <StatCard label="Total questions" value={String(attempt.totalQuestions)} />
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <p className="m-0 text-sm text-muted-foreground">
                  The source viewer highlights the excerpt saved with each citation.
                </p>
                <Button
                  variant="outline"
                  onClick={async () => {
                    setAttempt(null)
                    await navigate({
                      to: '/',
                      search: {
                        quizId: String(quiz.id),
                      },
                      replace: true,
                    })
                  }}
                >
                  Retake this quiz
                </Button>
              </CardFooter>
            </Card>
          </section>
        ) : null}
      </main>

      <Dialog open={Boolean(activeCitation)} onOpenChange={(open) => (!open ? setActiveCitation(null) : null)}>
        <DialogContent className="max-w-3xl p-0 sm:max-w-3xl" showCloseButton>
          {activeCitation ? (
            <>
              <DialogHeader className="border-b px-6 py-5">
                <DialogTitle>{activeCitation.documentName}</DialogTitle>
                <DialogDescription>
                  {activeCitation.sectionLabel || 'Unsectioned content'}
                  {typeof activeCitation.paragraphIndex === 'number'
                    ? ` • Paragraph ${activeCitation.paragraphIndex + 1}`
                    : ''}
                  {activeCitation.pageNumber ? ` • Page ${activeCitation.pageNumber}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm leading-7 text-slate-800">
                  {renderHighlightedText(activeCitation.chunkText, activeCitation.excerptStartOffset, activeCitation.excerptEndOffset)}
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                  Saved excerpt: <strong>{activeCitation.excerpt}</strong>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
        {number}
      </div>
      <div>
        <p className="m-0 text-sm font-semibold text-slate-900">{title}</p>
        <p className="m-0 text-sm text-slate-600">{children}</p>
      </div>
    </div>
  )
}

function Pill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/80 px-3 py-1.5">
      <span className="text-amber-600">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="m-0 text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 mb-0 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function renderHighlightedText(text: string, startOffset: number, endOffset: number) {
  const safeStart = Math.max(0, Math.min(startOffset, text.length))
  const safeEnd = Math.max(safeStart, Math.min(endOffset, text.length))

  return (
    <>
      {text.slice(0, safeStart)}
      <mark className="rounded bg-amber-300/80 px-1 py-0.5 text-slate-900">{text.slice(safeStart, safeEnd)}</mark>
      {text.slice(safeEnd)}
    </>
  )
}

function removeExtension(filename: string) {
  const lastDotIndex = filename.lastIndexOf('.')
  return lastDotIndex >= 0 ? filename.slice(0, lastDotIndex) : filename
}
