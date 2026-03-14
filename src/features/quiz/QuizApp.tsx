import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Expand,
  FileText,
  FolderOpen,
  LibraryBig,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '#/components/ui/sheet'
import {
  generateRemedialQuiz,
  listQuizzes,
  generateQuiz,
  getAttempt,
  getQuiz,
  submitQuiz,
  updateQuizMetadata,
} from '#/features/quiz/server'
import { SourceDocumentContent } from '#/features/quiz/sourceRichText'
import type {
  AttemptSummaryRecord,
  AttemptRecord,
  CitationRecord,
  QuizMetadataUpdate,
  QuizRecord,
  QuizSummaryRecord,
} from '#/features/quiz/types'

type SearchState = {
  quizId?: string
  attemptId?: string
}

type UploadDraft = {
  file: File
  displayName: string
}

type QuizMetadataDraft = {
  quizId: number
  title: string
  subjectPath: string
}

type SubjectTreeNode = {
  key: string
  label: string
  children: SubjectTreeNode[]
  quizzes: QuizSummaryRecord[]
  latestAverageScore: number | null
  remedialAvailability: 'available' | 'no_attempts' | 'no_incorrect'
}

const UNCATEGORIZED_SUBJECT = 'Uncategorized'
type ReviewFilter = 'all' | 'incorrect_first' | 'incorrect_only'

export function QuizApp({ search }: { search: SearchState }) {
  const navigate = useNavigate({ from: '/' })
  const [uploads, setUploads] = useState<UploadDraft[]>([])
  const [subjectPath, setSubjectPath] = useState(UNCATEGORIZED_SUBJECT)
  const [totalQuestions, setTotalQuestions] = useState(8)
  const [multipleChoiceRatio, setMultipleChoiceRatio] = useState(75)
  const [quizList, setQuizList] = useState<QuizSummaryRecord[]>([])
  const [quiz, setQuiz] = useState<QuizRecord | null>(null)
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [activeCitation, setActiveCitation] = useState<CitationRecord | null>(null)
  const [selectedSourceDocumentId, setSelectedSourceDocumentId] = useState<number | null>(null)
  const [pendingSourceDocumentId, setPendingSourceDocumentId] = useState<number | null>(null)
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({})
  const [expandedQuizzes, setExpandedQuizzes] = useState<Record<number, boolean>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [subjectRemedialKey, setSubjectRemedialKey] = useState<string | null>(null)
  const [isGeneratingQuizRemedial, setIsGeneratingQuizRemedial] = useState(false)
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(false)
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all')
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false)
  const [selectedLibraryQuiz, setSelectedLibraryQuiz] = useState<QuizSummaryRecord | null>(null)
  const [isExpandedSourceDialogOpen, setIsExpandedSourceDialogOpen] = useState(false)
  const [editingQuizDraft, setEditingQuizDraft] = useState<QuizMetadataDraft | null>(null)
  const [isUpdatingQuizMetadata, setIsUpdatingQuizMetadata] = useState(false)
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true)
  const [isMobileLibraryOpen, setIsMobileLibraryOpen] = useState(false)
  const [isMobileSourceOpen, setIsMobileSourceOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refreshLibrary()
  }, [])

  useEffect(() => {
    if (!search.quizId) {
      setQuiz(null)
      setAttempt(null)
      setAnswers({})
      setActiveCitation(null)
      setSelectedSourceDocumentId(null)
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
        setSubjectPath(data.quiz.subjectPath)
        setExpandedQuizzes((current) => ({ ...current, [data.quiz.id]: true }))
        expandSubjectPath(data.quiz.subjectPath)
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

  useEffect(() => {
    if (!quiz) {
      return
    }

    if (activeCitation) {
      setSelectedSourceDocumentId(activeCitation.documentId)
      return
    }

    if (pendingSourceDocumentId && quiz.documents.some((document) => document.id === pendingSourceDocumentId)) {
      setSelectedSourceDocumentId(pendingSourceDocumentId)
      setPendingSourceDocumentId(null)
      return
    }

    if (!selectedSourceDocumentId || !quiz.documents.some((document) => document.id === selectedSourceDocumentId)) {
      setSelectedSourceDocumentId(quiz.documents[0]?.id ?? null)
    }
  }, [activeCitation, pendingSourceDocumentId, quiz, selectedSourceDocumentId])

  const answeredQuestionCount = useMemo(
    () => (quiz ? quiz.questions.filter((question) => answers[question.id]).length : 0),
    [answers, quiz],
  )
  const displayedQuestions = useMemo(() => {
    if (!quiz) {
      return []
    }

    const questionsWithReview = quiz.questions.map((question) => {
      const reviewAnswer = attempt?.answers.find((answer) => answer.questionId === question.id)
      return {
        question,
        reviewAnswer,
      }
    })

    if (!attempt || reviewFilter === 'all') {
      return questionsWithReview
    }

    if (reviewFilter === 'incorrect_only') {
      return questionsWithReview.filter((entry) => entry.reviewAnswer && !entry.reviewAnswer.isCorrect)
    }

    return [...questionsWithReview].sort((left, right) => {
      const leftIncorrect = left.reviewAnswer && !left.reviewAnswer.isCorrect ? 0 : 1
      const rightIncorrect = right.reviewAnswer && !right.reviewAnswer.isCorrect ? 0 : 1
      return leftIncorrect - rightIncorrect || left.question.position - right.question.position
    })
  }, [attempt, quiz, reviewFilter])

  const quizTree = useMemo(() => buildSubjectTree(quizList), [quizList])
  const subjectPathSuggestions = useMemo(() => getSubjectPathSuggestions(quizList), [quizList])
  const selectedDocument =
    quiz?.documents.find((document) => document.id === selectedSourceDocumentId) ?? quiz?.documents[0] ?? null
  const activeQuizSummary = useMemo(() => quizList.find((entry) => entry.id === quiz?.id) ?? null, [quiz, quizList])
  const latestAttemptId = activeQuizSummary?.attempts[0]?.id ?? null
  const isViewingLatestAttempt = attempt ? latestAttemptId === attempt.id : false
  const canGenerateQuizRemedial = Boolean(
    quiz && attempt && isViewingLatestAttempt && attempt.correctAnswers < attempt.totalQuestions,
  )

  async function refreshLibrary() {
    setIsLoadingLibrary(true)

    try {
      const data = await listQuizzes({ data: {} })
      setQuizList(
        [...data.quizzes].sort(
          (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
        ),
      )
    } catch (libraryError) {
      setError(libraryError instanceof Error ? libraryError.message : 'Unable to load quiz library')
    } finally {
      setIsLoadingLibrary(false)
    }
  }

  function expandSubjectPath(path: string) {
    const parts = splitSubjectPath(path)
    if (parts.length === 0) {
      return
    }

    setExpandedSubjects((current) => {
      const next = { ...current }
      let cursor = ''

      parts.forEach((part) => {
        cursor = cursor ? `${cursor}/${part}` : part
        next[cursor] = true
      })

      return next
    })
  }

  async function openQuiz(
    quizId: number,
    options?: { attemptId?: number; documentId?: number; closeMobile?: boolean },
  ) {
    if (options?.documentId) {
      setPendingSourceDocumentId(options.documentId)
    }

    setActiveCitation(null)
    setExpandedQuizzes((current) => ({ ...current, [quizId]: true }))

    if (options?.closeMobile) {
      setIsMobileLibraryOpen(false)
    }

    await navigate({
      to: '/',
      search: {
        quizId: String(quizId),
        attemptId: options?.attemptId ? String(options.attemptId) : undefined,
      },
      replace: true,
    })
  }

  function handleQuizSelection(quizSummary: QuizSummaryRecord, closeMobile = false) {
    if (quizSummary.attempts.length === 0) {
      void openQuiz(quizSummary.id, { closeMobile })
      return
    }

    setSelectedLibraryQuiz(quizSummary)
    if (closeMobile) {
      setIsMobileLibraryOpen(false)
    }
  }

  function openEditQuizDialog(quizMetadata: { id: number; title: string; subjectPath: string }) {
    setEditingQuizDraft({
      quizId: quizMetadata.id,
      title: quizMetadata.title,
      subjectPath: quizMetadata.subjectPath,
    })
  }

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
      formData.append('subjectPath', subjectPath)
      formData.append('totalQuestions', String(totalQuestions))
      formData.append('multipleChoiceRatio', String(multipleChoiceRatio))

      const data = await generateQuiz({ data: formData })

      setQuiz(data.quiz)
      setAttempt(null)
      setAnswers({})
      setUploads([])
      setActiveCitation(null)
      setSelectedSourceDocumentId(data.quiz.documents[0]?.id ?? null)
      expandSubjectPath(data.quiz.subjectPath)
      setExpandedQuizzes((current) => ({ ...current, [data.quiz.id]: true }))
      setIsCreateDialogOpen(false)
      setIsLeftPanelOpen(true)
      await refreshLibrary()
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
      setIsRightPanelOpen(true)
      setReviewFilter('all')
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

  async function handleGenerateQuizRemedial() {
    if (!quiz) {
      return
    }

    setError(null)
    setIsGeneratingQuizRemedial(true)

    try {
      const data = await generateRemedialQuiz({
        data: {
          scope: 'quiz',
          quizId: quiz.id,
        },
      })

      setQuiz(data.quiz)
      setAttempt(null)
      setAnswers({})
      setActiveCitation(null)
      setSelectedSourceDocumentId(data.quiz.documents[0]?.id ?? null)
      expandSubjectPath(data.quiz.subjectPath)
      setExpandedQuizzes((current) => ({ ...current, [data.quiz.id]: true }))
      setIsLeftPanelOpen(true)
      await refreshLibrary()
      await navigate({
        to: '/',
        search: {
          quizId: String(data.quiz.id),
        },
        replace: true,
      })
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate remedial quiz')
    } finally {
      setIsGeneratingQuizRemedial(false)
    }
  }

  async function handleGenerateSubjectRemedial(subjectKey: string) {
    setError(null)
    setSubjectRemedialKey(subjectKey)

    try {
      const data = await generateRemedialQuiz({
        data: {
          scope: 'subject',
          subjectPath: subjectKey.replaceAll('/', ' / '),
        },
      })

      setQuiz(data.quiz)
      setAttempt(null)
      setAnswers({})
      setActiveCitation(null)
      setSelectedSourceDocumentId(data.quiz.documents[0]?.id ?? null)
      expandSubjectPath(data.quiz.subjectPath)
      setExpandedQuizzes((current) => ({ ...current, [data.quiz.id]: true }))
      setIsLeftPanelOpen(true)
      await refreshLibrary()
      await navigate({
        to: '/',
        search: {
          quizId: String(data.quiz.id),
        },
        replace: true,
      })
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate subject remedial quiz')
    } finally {
      setSubjectRemedialKey(null)
    }
  }

  async function handleUpdateQuizMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editingQuizDraft) {
      return
    }

    setError(null)
    setIsUpdatingQuizMetadata(true)

    try {
      const data = await updateQuizMetadata({
        data: {
          quizId: editingQuizDraft.quizId,
          title: editingQuizDraft.title,
          subjectPath: editingQuizDraft.subjectPath,
        } satisfies QuizMetadataUpdate,
      })

      if (quiz?.id === data.quiz.id) {
        setQuiz(data.quiz)
      }

      setEditingQuizDraft(null)
      await refreshLibrary()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update quiz')
    } finally {
      setIsUpdatingQuizMetadata(false)
    }
  }

  function openCitation(citation: CitationRecord) {
    setActiveCitation(citation)
    setSelectedSourceDocumentId(citation.documentId)
    setIsRightPanelOpen(true)
  }

  function renderLibraryPanel(closeMobile = false) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border px-4 py-4">
          <p className="island-kicker mb-2">Library</p>
          <h2 className="text-lg font-semibold text-foreground">Quizzes and source material</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse by subject path, then jump directly into a quiz or one of its uploaded documents.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {isLoadingLibrary ? (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading library
            </div>
          ) : quizTree.length > 0 ? (
            <div className="space-y-1">
              {quizTree.map((node) => (
                <SubjectBranch
                  key={node.key}
                  node={node}
                  activeQuizId={quiz?.id ?? null}
                  expandedSubjects={expandedSubjects}
                  expandedQuizzes={expandedQuizzes}
                  onToggleSubject={(key) =>
                    setExpandedSubjects((current) => ({ ...current, [key]: !current[key] }))
                  }
                  onToggleQuiz={(quizId) =>
                    setExpandedQuizzes((current) => ({ ...current, [quizId]: !current[quizId] }))
                  }
                  onOpenQuiz={(quizSummary, documentId) => {
                    if (documentId) {
                      void openQuiz(quizSummary.id, { documentId, closeMobile })
                      return
                    }

                    handleQuizSelection(quizSummary, closeMobile)
                  }}
                  onSelectDocument={(quizId, documentId) => {
                    if (quiz?.id === quizId) {
                      setSelectedSourceDocumentId(documentId)
                      setActiveCitation(null)
                    } else {
                      void openQuiz(quizId, { documentId, closeMobile })
                    }
                  }}
                  onGenerateRemedial={handleGenerateSubjectRemedial}
                  activeRemedialKey={subjectRemedialKey}
                  onEditQuiz={openEditQuizDialog}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              Your quiz library is empty. Generate one to populate the sidebar.
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderSourcePanel({ expanded = false }: { expanded?: boolean } = {}) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="island-kicker mb-2">Source Review</p>
              <h2 className="text-lg font-semibold text-foreground">Uploaded material</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeCitation
                  ? 'The active citation is highlighted inside the saved source text.'
                  : 'Choose a document from the library or open a citation from quiz results to inspect the source.'}
              </p>
            </div>
            {!expanded ? (
              <Button variant="outline" size="sm" onClick={() => setIsExpandedSourceDialogOpen(true)}>
                <Expand className="size-4" />
                Expand
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          {quiz && selectedDocument ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {quiz.documents.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => {
                      setSelectedSourceDocumentId(document.id)
                      setActiveCitation(null)
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      selectedDocument.id === document.id
                        ? 'border-primary/40 bg-primary/12 text-foreground'
                        : 'border-border bg-muted/35 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                    }`}
                  >
                    {document.displayName}
                  </button>
                ))}
              </div>

              <Card className="border-border/80 bg-card/95">
                <CardHeader>
                  <CardTitle>{selectedDocument.displayName}</CardTitle>
                  <CardDescription>
                    {selectedDocument.originalFileName} • {selectedDocument.mimeType} • {selectedDocument.extractionStatus}
                  </CardDescription>
                </CardHeader>
                <CardContent className={expanded ? 'flex min-h-0 flex-col space-y-4' : 'space-y-4'}>
                  {selectedDocument.normalizationNotes ? (
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                      {selectedDocument.normalizationNotes}
                    </div>
                  ) : null}

                  {activeCitation && activeCitation.documentId === selectedDocument.id ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-3 text-sm text-foreground">
                      <p className="m-0 font-medium">Highlighted citation</p>
                      <p className="mt-1 text-muted-foreground">
                        {activeCitation.sectionLabel || 'Unsectioned content'}
                        {typeof activeCitation.paragraphIndex === 'number'
                          ? ` • Paragraph ${activeCitation.paragraphIndex + 1}`
                          : ''}
                        {activeCitation.pageNumber ? ` • Page ${activeCitation.pageNumber}` : ''}
                      </p>
                      <p className="mt-2 mb-0 text-sm leading-6 text-foreground">{activeCitation.excerpt}</p>
                    </div>
                  ) : null}

                  <div
                    className={`overflow-y-auto rounded-2xl border border-border bg-muted/20 p-4 ${
                      expanded ? 'min-h-0 flex-1' : 'max-h-[62vh]'
                    }`}
                  >
                    <SourceDocumentContent
                      rawText={selectedDocument.rawText}
                      documentId={selectedDocument.id}
                      citation={activeCitation}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              Open a quiz to review its uploaded material here.
            </div>
          )}
        </div>
      </div>
    )
  }

  function renderCreateQuizForm() {
    return (
      <form className="space-y-5" onSubmit={handleGenerateQuiz}>
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-2">
            <Label htmlFor="subject-path">Subject path</Label>
            <SubjectPathField
              id="subject-path"
              value={subjectPath}
              suggestions={subjectPathSuggestions}
              onChange={setSubjectPath}
            />
          </div>

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
        </div>

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
          <div className="space-y-3 rounded-2xl border border-border bg-muted/25 p-3">
            {uploads.map((upload, index) => (
              <div key={`${upload.file.name}-${index}`} className="grid gap-2 lg:grid-cols-[1fr_1.1fr]">
                <div>
                  <p className="text-sm font-medium text-foreground">{upload.file.name}</p>
                  <p className="text-xs text-muted-foreground">{(upload.file.size / 1024).toFixed(1)} KB</p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`display-name-${index}`}>Display name</Label>
                  <Input
                    id={`display-name-${index}`}
                    value={upload.displayName}
                    onChange={(event) => {
                      setUploads((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, displayName: event.target.value } : entry,
                        ),
                      )
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-sm text-foreground">
          This quiz will target <strong>{Math.round((totalQuestions * multipleChoiceRatio) / 100)}</strong>{' '}
          multiple choice questions and{' '}
          <strong>{totalQuestions - Math.round((totalQuestions * multipleChoiceRatio) / 100)}</strong> true/false
          questions.
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
    )
  }

  return (
    <>
      <main className="mx-auto w-[min(1520px,calc(100%-1rem))] px-1 pb-12 pt-6 sm:px-2 sm:pt-8">
        <section className="mb-4 grid gap-4 rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,transparent),color-mix(in_srgb,var(--muted)_45%,transparent))] p-4 shadow-[0_22px_60px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="island-kicker mb-2">Workspace</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Study from your own material</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              Generate quizzes, organize them by subject path, and keep the original source material one toggle away while you review results.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              Generate quiz
            </Button>
            <Button variant="outline" className="lg:hidden" onClick={() => setIsMobileLibraryOpen(true)}>
              <LibraryBig className="size-4" />
              Library
            </Button>
            <Button variant="outline" className="lg:hidden" onClick={() => setIsMobileSourceOpen(true)}>
              <BookOpenText className="size-4" />
              Source
            </Button>
            <Button variant="outline" className="hidden lg:inline-flex" onClick={() => setIsLeftPanelOpen((value) => !value)}>
              {isLeftPanelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
              {isLeftPanelOpen ? 'Hide library' : 'Show library'}
            </Button>
            <Button variant="outline" className="hidden lg:inline-flex" onClick={() => setIsRightPanelOpen((value) => !value)}>
              {isRightPanelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              {isRightPanelOpen ? 'Hide source' : 'Show source'}
            </Button>
          </div>
        </section>

        {error ? (
          <section className="mb-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-900 dark:text-red-100">
            {error}
          </section>
        ) : null}

        <section
          className={`grid gap-4 ${
            isLeftPanelOpen && isRightPanelOpen
              ? 'lg:grid-cols-[300px_minmax(0,1fr)_380px]'
              : isLeftPanelOpen
                ? 'lg:grid-cols-[300px_minmax(0,1fr)]'
                : isRightPanelOpen
                  ? 'lg:grid-cols-[minmax(0,1fr)_380px]'
                  : 'lg:grid-cols-[minmax(0,1fr)]'
          }`}
        >
          {isLeftPanelOpen ? (
            <aside className="hidden lg:block overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/92 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
              {renderLibraryPanel()}
            </aside>
          ) : null}

          <div className="min-w-0 space-y-4">
            {isLoadingQuiz ? (
              <Card className="border-border/70 bg-card/95">
                <CardContent className="flex min-h-[220px] items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Loading quiz
                  </div>
                </CardContent>
              </Card>
            ) : !quiz ? (
              <Card className="border-border/70 bg-card/95">
                <CardContent className="flex min-h-[380px] flex-col items-center justify-center px-6 py-10 text-center">
                  <div className="rounded-full border border-primary/20 bg-primary/10 p-4">
                    <LibraryBig className="size-8 text-primary" />
                  </div>
                  <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">No active quiz selected</h2>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
                    Pick a quiz from the library or generate a new one. When a quiz is created, it will open here as
                    the active workspace.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <Button onClick={() => setIsCreateDialogOpen(true)}>Create quiz</Button>
                    <Button variant="outline" onClick={() => setIsLeftPanelOpen(true)}>
                      Open library
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {quiz ? (
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="island-kicker mb-2">Quiz</p>
                    <button
                      type="button"
                      onClick={() => setIsMetadataDialogOpen(true)}
                      className="rounded-xl text-left transition hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{quiz.title}</h2>
                        {quiz.generationMode === 'remedial' ? (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-900 dark:text-amber-100">
                            Remedial
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {quiz.subjectPath} • {quiz.totalQuestions} questions • {quiz.documents.length} source
                        document{quiz.documents.length === 1 ? '' : 's'} • View metadata
                      </p>
                    </button>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Answered {answeredQuestionCount} of {quiz.questions.length} questions
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={() => openEditQuizDialog(quiz)}>
                      <Pencil className="size-4" />
                      Edit quiz
                    </Button>
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
                      <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-900 dark:text-emerald-100">
                        Attempt recorded
                      </div>
                    )}
                  </div>
                </div>

                {attempt ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Review:</span>
                    <Button
                      variant={reviewFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReviewFilter('all')}
                    >
                      All questions
                    </Button>
                    <Button
                      variant={reviewFilter === 'incorrect_first' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReviewFilter('incorrect_first')}
                    >
                      Incorrect first
                    </Button>
                    <Button
                      variant={reviewFilter === 'incorrect_only' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReviewFilter('incorrect_only')}
                    >
                      Incorrect only
                    </Button>
                  </div>
                ) : null}

                {displayedQuestions.length === 0 && attempt && reviewFilter === 'incorrect_only' ? (
                  <Card className="border-border/70 bg-card/95">
                    <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No incorrect answers in this attempt.
                    </CardContent>
                  </Card>
                ) : null}

                {displayedQuestions.map(({ question, reviewAnswer }) => {
                  const selectedAnswer = answers[question.id] ?? ''

                  return (
                    <Card key={question.id} className="border-border/70 bg-card/96">
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <CardTitle>
                              {question.position + 1}. {question.prompt}
                            </CardTitle>
                            <CardDescription>
                              {question.questionType === 'multiple_choice' ? 'Multiple choice' : 'True / False'}
                            </CardDescription>
                          </div>
                          {reviewAnswer ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                                reviewAnswer.isCorrect
                                  ? 'border border-emerald-500/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100'
                                  : 'border border-rose-500/25 bg-rose-500/10 text-rose-900 dark:text-rose-100'
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
                                  ? 'border-primary/35 bg-primary/10'
                                  : 'border-border bg-muted/30 hover:bg-muted/55'
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
                              <span className="text-sm leading-6 text-foreground">{option}</span>
                            </label>
                          ))}
                        </div>

                        {attempt ? (
                          <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-7 text-foreground">
                            <p className="m-0">
                              <strong>Your answer:</strong> {reviewAnswer?.selectedAnswer}
                            </p>
                            <p className="m-0">
                              <strong>Correct answer:</strong> {question.correctAnswer}
                            </p>
                            <p className="mt-2 mb-0 text-muted-foreground">{question.explanation}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {question.citations.map((citation, citationIndex) => (
                                <Button
                                  key={citation.id}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openCitation(citation)}
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
              </section>
            ) : null}

            {quiz && attempt ? (
              <Card className="border-border/70 bg-card/95">
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
                  <div className="space-y-2">
                    <p className="m-0 text-sm text-muted-foreground">
                      Open any citation to review the saved supporting excerpt in the source panel.
                    </p>
                    {!isViewingLatestAttempt ? (
                      <p className="m-0 text-xs text-muted-foreground">
                        Remedial generation is only available from the latest attempt for this quiz.
                      </p>
                    ) : null}
                    {attempt.correctAnswers === attempt.totalQuestions ? (
                      <p className="m-0 text-xs text-muted-foreground">
                        This latest attempt has no incorrect answers to remediate.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={!canGenerateQuizRemedial || isGeneratingQuizRemedial}
                      onClick={handleGenerateQuizRemedial}
                    >
                      {isGeneratingQuizRemedial ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          Generating remedial
                        </>
                      ) : (
                        'Generate remedial quiz'
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        setAttempt(null)
                        setActiveCitation(null)
                        setReviewFilter('all')
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
                  </div>
                </CardFooter>
              </Card>
            ) : null}
          </div>

          {isRightPanelOpen ? (
            <aside className="hidden lg:block overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/92 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
              {renderSourcePanel()}
            </aside>
          ) : null}
        </section>
      </main>

      <Sheet open={isMobileLibraryOpen} onOpenChange={setIsMobileLibraryOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-none p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>Quiz library</SheetTitle>
            <SheetDescription>Browse quizzes and source material.</SheetDescription>
          </SheetHeader>
          {renderLibraryPanel(true)}
        </SheetContent>
      </Sheet>

      <Sheet open={isMobileSourceOpen} onOpenChange={setIsMobileSourceOpen}>
        <SheetContent side="right" className="w-[92vw] max-w-none p-0 sm:max-w-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>Source review</SheetTitle>
            <SheetDescription>Review uploaded material and source highlights.</SheetDescription>
          </SheetHeader>
          {renderSourcePanel()}
        </SheetContent>
      </Sheet>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-6 py-5">
            <DialogTitle>Create a new quiz</DialogTitle>
            <DialogDescription>
              Add a subject path, upload your source files, and generate a quiz into the active workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-5">{renderCreateQuizForm()}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingQuizDraft)} onOpenChange={(open) => (!open ? setEditingQuizDraft(null) : null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0 sm:max-w-2xl">
          {editingQuizDraft ? (
            <>
              <DialogHeader className="border-b px-6 py-5">
                <DialogTitle>Edit quiz</DialogTitle>
                <DialogDescription>Rename the quiz and adjust its subject path.</DialogDescription>
              </DialogHeader>
              <div className="px-6 py-5">
                <form className="space-y-5" onSubmit={handleUpdateQuizMetadata}>
                  <div className="space-y-2">
                    <Label htmlFor="edit-quiz-title">Quiz name</Label>
                    <Input
                      id="edit-quiz-title"
                      value={editingQuizDraft.title}
                      onChange={(event) =>
                        setEditingQuizDraft((current) =>
                          current ? { ...current, title: event.target.value } : current,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-subject-path">Subject path</Label>
                    <SubjectPathField
                      id="edit-subject-path"
                      value={editingQuizDraft.subjectPath}
                      suggestions={subjectPathSuggestions}
                      onChange={(value) =>
                        setEditingQuizDraft((current) =>
                          current ? { ...current, subjectPath: value } : current,
                        )
                      }
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" type="button" onClick={() => setEditingQuizDraft(null)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isUpdatingQuizMetadata}>
                      {isUpdatingQuizMetadata ? (
                        <>
                          <LoaderCircle className="size-4 animate-spin" />
                          Saving
                        </>
                      ) : (
                        'Save changes'
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isMetadataDialogOpen} onOpenChange={setIsMetadataDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0 sm:max-w-4xl">
          {quiz ? (
            <>
              <DialogHeader className="border-b px-6 py-5">
                <DialogTitle>{quiz.title}</DialogTitle>
                <DialogDescription>
                  {quiz.subjectPath} • {quiz.totalQuestions} questions • {quiz.documents.length} source document
                  {quiz.documents.length === 1 ? '' : 's'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 px-6 py-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard label="Provider" value={quiz.provider} />
                  <StatCard label="Model" value={quiz.model} />
                  <StatCard label="Generation" value={quiz.generationMode === 'remedial' ? 'Remedial' : 'Standard'} />
                  <StatCard label="Multiple choice" value={String(quiz.multipleChoiceCount)} />
                  <StatCard label="True / false" value={String(quiz.trueFalseCount)} />
                </div>

                {quiz.generationMode === 'remedial' ? (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                    {quiz.remedialScope === 'quiz' && quiz.parentQuizId
                      ? `Remedial quiz generated from the latest incorrect answers in quiz #${quiz.parentQuizId}.`
                      : `Remedial quiz generated from the latest incorrect answers in ${quiz.sourceSubjectPath ?? quiz.subjectPath}.`}
                  </div>
                ) : null}

                <Card className="border-border/70 bg-card/95">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle>Source documents</CardTitle>
                        <CardDescription>Material attached to this quiz.</CardDescription>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openEditQuizDialog(quiz)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {quiz.documents.map((document) => (
                      <div
                        key={document.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-muted/25 px-3 py-3"
                      >
                        <div>
                          <p className="m-0 text-sm font-medium text-foreground">{document.displayName}</p>
                          <p className="mt-1 mb-0 text-xs text-muted-foreground">{document.originalFileName}</p>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <p className="m-0">{document.mimeType}</p>
                          <p className="mt-1 mb-0">{document.extractionStatus}</p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {quiz.generationNotes ? (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                    {quiz.generationNotes}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedLibraryQuiz)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLibraryQuiz(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto p-0 sm:max-w-2xl">
          {selectedLibraryQuiz ? (
            <>
              <DialogHeader className="border-b px-6 py-5">
                <DialogTitle>{selectedLibraryQuiz.title}</DialogTitle>
                <DialogDescription>
                  {selectedLibraryQuiz.attempts.length} saved attempt
                  {selectedLibraryQuiz.attempts.length === 1 ? '' : 's'} for this quiz.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-5 px-6 py-5">
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => {
                      const latestAttempt = selectedLibraryQuiz.attempts[0]
                      setSelectedLibraryQuiz(null)
                      void openQuiz(selectedLibraryQuiz.id, { attemptId: latestAttempt.id })
                    }}
                  >
                    View latest results
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedLibraryQuiz(null)
                      void openQuiz(selectedLibraryQuiz.id)
                    }}
                  >
                    Retake quiz
                  </Button>
                </div>

                <Card className="border-border/70 bg-card/95">
                  <CardHeader>
                    <CardTitle>Past attempts</CardTitle>
                    <CardDescription>Open a previous result directly from the library.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedLibraryQuiz.attempts.map((attemptSummary) => (
                      <button
                        key={attemptSummary.id}
                        type="button"
                        onClick={() => {
                          setSelectedLibraryQuiz(null)
                          void openQuiz(selectedLibraryQuiz.id, { attemptId: attemptSummary.id })
                        }}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-left transition hover:bg-muted/45"
                      >
                        <div>
                          <p className="m-0 text-sm font-medium text-foreground">
                            {formatAttemptLabel(attemptSummary)}
                          </p>
                          <p className="mt-1 mb-0 text-xs text-muted-foreground">
                            {new Date(attemptSummary.submittedAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-foreground">{attemptSummary.scorePercent}%</span>
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isExpandedSourceDialogOpen} onOpenChange={setIsExpandedSourceDialogOpen}>
        <DialogContent className="flex h-[92vh] max-h-[92vh] max-w-[96vw] overflow-hidden p-0 sm:max-w-[96vw]">
          <DialogHeader className="sr-only">
            <DialogTitle>Expanded source review</DialogTitle>
            <DialogDescription>Review source material in a larger reading view.</DialogDescription>
          </DialogHeader>
          {renderSourcePanel({ expanded: true })}
        </DialogContent>
      </Dialog>
    </>
  )
}

function SubjectBranch({
  node,
  activeQuizId,
  expandedSubjects,
  expandedQuizzes,
  onToggleSubject,
  onToggleQuiz,
  onOpenQuiz,
  onSelectDocument,
  onGenerateRemedial,
  activeRemedialKey,
  onEditQuiz,
}: {
  node: SubjectTreeNode
  activeQuizId: number | null
  expandedSubjects: Record<string, boolean>
  expandedQuizzes: Record<number, boolean>
  onToggleSubject: (key: string) => void
  onToggleQuiz: (quizId: number) => void
  onOpenQuiz: (quiz: QuizSummaryRecord, documentId?: number) => void
  onSelectDocument: (quizId: number, documentId: number) => void
  onGenerateRemedial: (subjectKey: string) => void
  activeRemedialKey: string | null
  onEditQuiz: (quiz: QuizSummaryRecord) => void
}) {
  const isExpanded = expandedSubjects[node.key] ?? true
  const remedialDisabled = node.remedialAvailability !== 'available'
  const remedialHelpText =
    node.remedialAvailability === 'no_attempts'
      ? 'No latest attempts in this category yet.'
      : node.remedialAvailability === 'no_incorrect'
        ? 'Latest attempts in this category have no incorrect answers.'
        : 'Generate a remedial quiz from the latest misses in this category.'

  return (
    <div className="rounded-2xl border border-transparent bg-transparent">
      <div className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-muted/45">
        <button
          type="button"
          onClick={() => onToggleSubject(node.key)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-foreground"
        >
          {isExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <FolderOpen className="size-4 text-primary" />
          <span className="flex-1 truncate">{node.label}</span>
          {isTopLevelSubject(node) && node.latestAverageScore !== null ? (
            <span className="text-xs font-medium text-muted-foreground">
              Avg {Math.round(node.latestAverageScore)}%
            </span>
          ) : null}
        </button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={remedialDisabled || activeRemedialKey === node.key}
          title={remedialHelpText}
          onClick={(event) => {
            event.stopPropagation()
            onGenerateRemedial(node.key)
          }}
        >
          {activeRemedialKey === node.key ? (
            <>
              <LoaderCircle className="size-4 animate-spin" />
              Remedial
            </>
          ) : (
            'Remedial'
          )}
        </Button>
      </div>

      {isExpanded ? (
        <div className="ml-3 border-l border-border/70 pl-2">
          {node.children.map((child) => (
            <SubjectBranch
              key={child.key}
              node={child}
              activeQuizId={activeQuizId}
              expandedSubjects={expandedSubjects}
              expandedQuizzes={expandedQuizzes}
              onToggleSubject={onToggleSubject}
              onToggleQuiz={onToggleQuiz}
              onOpenQuiz={onOpenQuiz}
              onSelectDocument={onSelectDocument}
              onGenerateRemedial={onGenerateRemedial}
              activeRemedialKey={activeRemedialKey}
              onEditQuiz={onEditQuiz}
            />
          ))}

          {node.quizzes.map((quiz) => {
            const isQuizExpanded = expandedQuizzes[quiz.id] ?? quiz.id === activeQuizId

            return (
              <div key={quiz.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => {
                    onToggleQuiz(quiz.id)
                    onOpenQuiz(quiz)
                  }}
                  className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition ${
                    quiz.id === activeQuizId ? 'bg-primary/12 text-foreground' : 'hover:bg-muted/45 text-foreground'
                  }`}
                >
                  {isQuizExpanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <LibraryBig className="size-4 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {quiz.title}
                      {quiz.generationMode === 'remedial' ? ' • Remedial' : ''}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {quiz.totalQuestions} questions • {formatLatestScore(quiz)} • {quiz.attempts.length} attempt
                      {quiz.attempts.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      onEditQuiz(quiz)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        onEditQuiz(quiz)
                      }
                    }}
                    className="inline-flex rounded-md border border-border bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    Edit
                  </span>
                </button>

                {isQuizExpanded ? (
                  <div className="ml-6 space-y-1 py-1">
                    {quiz.documents.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => onSelectDocument(quiz.id, document.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition hover:bg-muted/45 hover:text-foreground"
                      >
                        <FileText className="size-4" />
                        <span className="truncate">{document.displayName}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/25 p-4">
      <p className="m-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 mb-0 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function SubjectPathField({
  id,
  value,
  suggestions,
  onChange,
}: {
  id: string
  value: string
  suggestions: string[]
  onChange: (value: string) => void
}) {
  const listId = `${id}-suggestions`
  const filteredSuggestions = suggestions
    .filter((suggestion) => suggestion.toLowerCase().includes(value.trim().toLowerCase()))
    .slice(0, 6)

  return (
    <div className="space-y-2">
      <Input
        id={id}
        list={listId}
        value={value}
        placeholder="History / Civil War / Reconstruction"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <p className="text-sm text-muted-foreground">
        Use `/` to create nested categories. Pick an existing path or type a new one.
      </p>
      {filteredSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              className="rounded-full border border-border bg-muted/25 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted/50 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function buildSubjectTree(quizzes: QuizSummaryRecord[]) {
  const roots: SubjectTreeNode[] = []

  for (const quiz of quizzes) {
    const pathParts = splitSubjectPath(quiz.subjectPath)
    let currentLevel = roots
    let currentNode: SubjectTreeNode | null = null
    let currentKey = ''

    for (const part of pathParts) {
      currentKey = currentKey ? `${currentKey}/${part}` : part
      let nextNode = currentLevel.find((node) => node.key === currentKey)

      if (!nextNode) {
        nextNode = {
          key: currentKey,
          label: part,
          children: [],
          quizzes: [],
          latestAverageScore: null,
          remedialAvailability: 'no_attempts',
        }
        currentLevel.push(nextNode)
      }

      currentNode = nextNode
      currentLevel = nextNode.children
    }

    currentNode?.quizzes.push(quiz)
  }

  return sortNodes(roots)
}

function sortNodes(nodes: SubjectTreeNode[]) {
  return [...nodes]
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((node) => {
      const children = sortNodes(node.children)
      const quizzes = [...node.quizzes].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )

      return {
        ...node,
        quizzes,
        children,
        latestAverageScore: computeAverageLatestScore(quizzes, children),
        remedialAvailability: computeSubjectRemedialAvailability(quizzes, children),
      }
    })
}

function splitSubjectPath(subjectPath: string) {
  return (subjectPath || UNCATEGORIZED_SUBJECT)
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function removeExtension(filename: string) {
  const lastDotIndex = filename.lastIndexOf('.')
  return lastDotIndex >= 0 ? filename.slice(0, lastDotIndex) : filename
}

function formatAttemptLabel(attempt: AttemptSummaryRecord) {
  return `${attempt.correctAnswers}/${attempt.totalQuestions} correct`
}

function getSubjectPathSuggestions(quizzes: QuizSummaryRecord[]) {
  return [...new Set(quizzes.map((quiz) => quiz.subjectPath).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  )
}

function formatLatestScore(quiz: QuizSummaryRecord) {
  const latestAttempt = quiz.attempts[0]
  return latestAttempt ? `Latest ${latestAttempt.scorePercent}%` : 'No results yet'
}

function computeSubjectRemedialAvailability(quizzes: QuizSummaryRecord[], children: SubjectTreeNode[]) {
  const ownLatestScores = quizzes
    .map((quiz) => quiz.attempts[0]?.scorePercent)
    .filter((score): score is number => typeof score === 'number')
  const childStates = children.map((child) => child.remedialAvailability)

  if (ownLatestScores.length === 0 && childStates.every((state) => state === 'no_attempts')) {
    return 'no_attempts' as const
  }

  if (ownLatestScores.some((score) => score < 100) || childStates.includes('available')) {
    return 'available' as const
  }

  return 'no_incorrect' as const
}

function computeAverageLatestScore(quizzes: QuizSummaryRecord[], children: SubjectTreeNode[]) {
  const scores = [
    ...quizzes
      .map((quiz) => quiz.attempts[0]?.scorePercent)
      .filter((score): score is number => typeof score === 'number'),
    ...children.flatMap((child) => collectLatestScores(child)),
  ]

  if (scores.length === 0) {
    return null
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

function isTopLevelSubject(node: SubjectTreeNode) {
  return !node.key.includes('/')
}

function collectLatestScores(node: SubjectTreeNode): number[] {
  return [
    ...node.quizzes
      .map((quiz) => quiz.attempts[0]?.scorePercent)
      .filter((score): score is number => typeof score === 'number'),
    ...node.children.flatMap((child) => collectLatestScores(child)),
  ]
}
