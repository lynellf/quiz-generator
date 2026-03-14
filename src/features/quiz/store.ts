import { asc, desc, eq, inArray, like, or } from 'drizzle-orm'
import { getDb } from '#/db/client'
import {
  documentChunks,
  documents,
  questionCitations,
  quizAttemptAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  sourceCollections,
} from '#/db/schema'
import { computeQuestionTypeCounts, normalizeDocument } from '#/features/quiz/normalize'
import { generateQuizWithOpenRouter, generateRemedialQuizWithOpenRouter } from '#/features/quiz/openrouter'
import {
  buildRemedialQuizTitle,
  computeRemedialQuestionMix,
  prepareRemedialDocuments,
  selectRemedialSeeds,
} from '#/features/quiz/remedial'
import type {
  AttemptSummaryRecord,
  AttemptRecord,
  CitationRecord,
  ParsedUpload,
  QuizGenerationMode,
  QuizGenerationSettings,
  QuizMetadataUpdate,
  RemedialQuestionSeed,
  RemedialScope,
  QuizRecord,
  QuizQuestionRecord,
  QuizSummaryRecord,
  SourceChunkForModel,
} from '#/features/quiz/types'

const MAX_SOURCE_CHUNKS = 120

type PersistableDocument = {
  originalFileName: string
  displayName: string
  mimeType: string
  extension: string
  extractionStatus: string
  normalizationNotes: string | null
  rawText: string
  chunks: Array<{
    chunkIndex: number
    sectionLabel: string | null
    text: string
    documentStartOffset: number
    documentEndOffset: number
    paragraphIndex: number
    pageNumber: number | null
    originalChunkId?: number
  }>
}

type QuizCounts = {
  totalQuestions: number
  multipleChoiceCount: number
  trueFalseCount: number
}

export async function createQuizFromUploads({
  uploads,
  settings,
  env = process.env,
}: {
  uploads: ParsedUpload[]
  settings: QuizGenerationSettings
  env?: NodeJS.ProcessEnv
}) {
  if (uploads.length === 0) {
    throw new Error('Upload at least one document to generate a quiz')
  }

  const counts = computeQuestionTypeCounts(settings.totalQuestions, settings.multipleChoiceRatio)
  const normalizedDocuments = uploads.map(normalizeDocument)
  const totalChunkCount = normalizedDocuments.reduce((sum, document) => sum + document.chunks.length, 0)

  if (totalChunkCount === 0) {
    throw new Error('No readable text was extracted from the uploaded files')
  }

  if (totalChunkCount > MAX_SOURCE_CHUNKS) {
    throw new Error(`Too much source material for v1. Please keep the total chunk count under ${MAX_SOURCE_CHUNKS}.`)
  }

  const persistedSources = await persistSourceDocuments({
    title:
      normalizedDocuments.length === 1
        ? normalizedDocuments[0].displayName
        : `${normalizedDocuments.length} uploaded documents`,
    documents: normalizedDocuments,
  })

  const generation = await generateQuizWithOpenRouter({
    settings: counts,
    chunks: persistedSources.modelChunks,
    env,
  })

  validateGeneratedQuestionMix(generation.payload.questions, counts)

  return persistGeneratedQuiz({
    sourceCollectionId: persistedSources.sourceCollectionId,
    subjectPath: settings.subjectPath,
    title: generation.payload.quizTitle,
    counts,
    provider: generation.provider,
    model: generation.model,
    generationNotes: normalizedDocuments.some((document) => document.extractionStatus === 'partial')
      ? 'At least one source used partial text extraction.'
      : null,
    chunkById: persistedSources.chunkById,
    questions: generation.payload.questions,
    generationMode: 'standard',
  })
}

export async function createRemedialQuiz({
  scope,
  quizId,
  subjectPath,
  env = process.env,
}: {
  scope: RemedialScope
  quizId?: number
  subjectPath?: string
  env?: NodeJS.ProcessEnv
}) {
  const remedialContext =
    scope === 'quiz'
      ? await getQuizRemedialContext(quizId)
      : await getSubjectRemedialContext(subjectPath)

  const selectedSeeds = selectRemedialSeeds(remedialContext.missedQuestions)
  if (selectedSeeds.length === 0) {
    throw new Error('There are no incorrect answers available for remediation.')
  }

  const citationsByChunkId = new Map<number, CitationRecord[]>()
  const uniqueChunks = new Map<number, SourceChunkForModel>()

  selectedSeeds.forEach((seed) => {
    seed.citations.forEach((citation) => {
      const currentCitations = citationsByChunkId.get(citation.chunkId) ?? []
      currentCitations.push(citation)
      citationsByChunkId.set(citation.chunkId, currentCitations)

      if (!uniqueChunks.has(citation.chunkId)) {
        uniqueChunks.set(citation.chunkId, {
          id: citation.chunkId,
          documentId: citation.documentId,
          documentName: citation.documentName,
          sectionLabel: citation.sectionLabel,
          paragraphIndex: citation.paragraphIndex ?? 0,
          pageNumber: citation.pageNumber,
          text: citation.chunkText,
        })
      }
    })
  })

  const modelChunks = [...uniqueChunks.values()].sort((left, right) => left.id - right.id)
  if (modelChunks.length === 0) {
    throw new Error('Unable to build remedial source material from the missed questions.')
  }

  if (modelChunks.length > MAX_SOURCE_CHUNKS) {
    throw new Error(`Too much remedial source material for v1. Please keep the total chunk count under ${MAX_SOURCE_CHUNKS}.`)
  }

  const preparedDocuments = prepareRemedialDocuments(modelChunks, citationsByChunkId)
  const persistedSources = await persistSourceDocuments({
    title: buildRemedialQuizTitle(remedialContext),
    documents: preparedDocuments,
  })

  const scopedChunks = [...persistedSources.chunkById.values()].sort((left, right) => left.id - right.id)
  const generation = await generateRemedialQuizWithOpenRouter({
    questionTypes: selectedSeeds.map((seed) => seed.questionType),
    chunks: scopedChunks,
    missedQuestions: selectedSeeds.map((seed) => ({
      ...seed,
      citations: seed.citations
        .map((citation) => {
          const persistedChunk = persistedSources.chunkIdByOriginalChunkId.get(citation.chunkId)
          if (!persistedChunk) {
            return null
          }

          return {
            ...citation,
            chunkId: persistedChunk.id,
            chunkText: persistedChunk.text,
            chunkDocumentStartOffset: persistedChunk.documentStartOffset,
            chunkDocumentEndOffset: persistedChunk.documentEndOffset,
            documentId: persistedChunk.documentId,
          }
        })
        .filter((citation): citation is CitationRecord => Boolean(citation)),
    })),
    scopeLabel: remedialContext.scope === 'quiz' ? remedialContext.quizTitle ?? 'Quiz' : remedialContext.subjectPath ?? 'Subject',
    env,
  })

  const counts = computeRemedialQuestionMix(selectedSeeds.map((seed) => seed.questionType))
  validateGeneratedQuestionMix(generation.payload.questions, counts)

  return persistGeneratedQuiz({
    sourceCollectionId: persistedSources.sourceCollectionId,
    subjectPath: remedialContext.subjectPath ?? 'Uncategorized',
    title: buildRemedialQuizTitle({
      scope,
      quizTitle: generation.payload.quizTitle || remedialContext.quizTitle,
      subjectPath: remedialContext.subjectPath,
    }),
    counts,
    provider: generation.provider,
    model: generation.model,
    generationNotes: `Generated from ${selectedSeeds.length} missed question${selectedSeeds.length === 1 ? '' : 's'} using cited source passages only.`,
    chunkById: persistedSources.chunkById,
    questions: generation.payload.questions,
    generationMode: 'remedial',
    remedialScope: scope,
    parentQuizId: remedialContext.parentQuizId,
    sourceSubjectPath: remedialContext.subjectPath ?? null,
  })
}

async function persistSourceDocuments({
  title,
  documents: sourceDocuments,
}: {
  title: string
  documents: PersistableDocument[]
}) {
  const db = getDb()
  const [sourceCollection] = await db
    .insert(sourceCollections)
    .values({
      title,
    })
    .returning()

  const modelChunks: SourceChunkForModel[] = []
  const chunkById = new Map<number, SourceChunkForModel>()
  const chunkIdByOriginalChunkId = new Map<
    number,
    SourceChunkForModel & { documentStartOffset: number; documentEndOffset: number }
  >()

  for (const sourceDocument of sourceDocuments) {
    const [document] = await db
      .insert(documents)
      .values({
        sourceCollectionId: sourceCollection.id,
        originalFileName: sourceDocument.originalFileName,
        displayName: sourceDocument.displayName,
        mimeType: sourceDocument.mimeType,
        extension: sourceDocument.extension,
        extractionStatus: sourceDocument.extractionStatus,
        rawText: sourceDocument.rawText,
        normalizationNotes: sourceDocument.normalizationNotes,
      })
      .returning()

    const insertedChunks = await db
      .insert(documentChunks)
      .values(
        sourceDocument.chunks.map((chunk) => ({
          documentId: document.id,
          chunkIndex: chunk.chunkIndex,
          sectionLabel: chunk.sectionLabel,
          text: chunk.text,
          documentStartOffset: chunk.documentStartOffset,
          documentEndOffset: chunk.documentEndOffset,
          paragraphIndex: chunk.paragraphIndex,
          pageNumber: chunk.pageNumber,
        })),
      )
      .returning()

    insertedChunks.forEach((chunk, index) => {
      const mappedChunk = {
        id: chunk.id,
        documentId: document.id,
        documentName: document.displayName,
        sectionLabel: chunk.sectionLabel,
        paragraphIndex: chunk.paragraphIndex,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
      }

      modelChunks.push(mappedChunk)
      chunkById.set(chunk.id, mappedChunk)

      const originalChunkId = sourceDocument.chunks[index]?.originalChunkId
      if (typeof originalChunkId === 'number') {
        chunkIdByOriginalChunkId.set(originalChunkId, {
          ...mappedChunk,
          documentStartOffset: chunk.documentStartOffset,
          documentEndOffset: chunk.documentEndOffset,
        })
      }
    })
  }

  return {
    sourceCollectionId: sourceCollection.id,
    modelChunks,
    chunkById,
    chunkIdByOriginalChunkId,
  }
}

async function persistGeneratedQuiz({
  sourceCollectionId,
  subjectPath,
  title,
  counts,
  provider,
  model,
  generationNotes,
  chunkById,
  questions,
  generationMode,
  remedialScope = null,
  parentQuizId = null,
  sourceSubjectPath = null,
}: {
  sourceCollectionId: number
  subjectPath: string
  title: string
  counts: QuizCounts
  provider: string
  model: string
  generationNotes: string | null
  chunkById: Map<number, SourceChunkForModel>
  questions: Array<{
    type: string
    prompt: string
    options?: string[]
    correctAnswer: string
    explanation: string
    citations: Array<{ chunkId: number; excerpt?: string }>
  }>
  generationMode: QuizGenerationMode
  remedialScope?: RemedialScope | null
  parentQuizId?: number | null
  sourceSubjectPath?: string | null
}) {
  const db = getDb()
  const [quiz] = await db
    .insert(quizzes)
    .values({
      sourceCollectionId,
      status: 'ready',
      subjectPath,
      generationMode,
      remedialScope,
      parentQuizId,
      sourceSubjectPath,
      title,
      totalQuestions: counts.totalQuestions,
      multipleChoiceCount: counts.multipleChoiceCount,
      trueFalseCount: counts.trueFalseCount,
      provider,
      model,
      generationNotes,
    })
    .returning()

  for (const [index, question] of questions.entries()) {
    const [insertedQuestion] = await db
      .insert(quizQuestions)
      .values({
        quizId: quiz.id,
        position: index,
        questionType: question.type,
        prompt: question.prompt.trim(),
        options: question.type === 'multiple_choice' ? question.options ?? null : null,
        correctAnswer: question.correctAnswer.trim(),
        explanation: question.explanation.trim(),
      })
      .returning()

    const citationRows = question.citations.map((citation) => {
      const chunk = chunkById.get(citation.chunkId)
      if (!chunk) {
        throw new Error(`Model cited unknown chunkId ${citation.chunkId}`)
      }

      const match = findExcerptRange(chunk.text, citation.excerpt)
      return {
        questionId: insertedQuestion.id,
        documentId: chunk.documentId,
        chunkId: chunk.id,
        sectionLabel: chunk.sectionLabel,
        paragraphIndex: chunk.paragraphIndex,
        pageNumber: chunk.pageNumber,
        excerpt: match.excerpt,
        excerptStartOffset: match.startOffset,
        excerptEndOffset: match.endOffset,
      }
    })

    await db.insert(questionCitations).values(citationRows)
  }

  return getQuizRecord(quiz.id)
}

async function getQuizRemedialContext(quizId: number | undefined) {
  if (!quizId || !Number.isInteger(quizId) || quizId <= 0) {
    throw new Error('A valid quizId is required to generate a remedial quiz.')
  }

  const db = getDb()
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId))
  if (!quiz) {
    throw new Error('Quiz not found')
  }

  const latestAttempt = await getLatestAttemptForQuiz(quizId)
  if (!latestAttempt) {
    throw new Error('No attempts found for this quiz yet.')
  }

  const missedQuestions = await getMissedQuestionSeedsForAttempts([latestAttempt.id])
  if (missedQuestions.length === 0) {
    throw new Error('The latest attempt has no incorrect answers to remediate.')
  }

  return {
    scope: 'quiz' as const,
    quizTitle: quiz.title,
    parentQuizId: quiz.id,
    subjectPath: quiz.subjectPath,
    missedQuestions,
  }
}

async function getSubjectRemedialContext(subjectPath: string | undefined) {
  const normalizedSubjectPath = normalizeSubjectPath(subjectPath ?? '')
  const db = getDb()
  const subjectPrefix = `${normalizedSubjectPath} / `
  const relatedQuizzes = await db
    .select()
    .from(quizzes)
    .where(or(eq(quizzes.subjectPath, normalizedSubjectPath), like(quizzes.subjectPath, `${subjectPrefix}%`)))

  if (relatedQuizzes.length === 0) {
    throw new Error('No quizzes were found in this category.')
  }

  const latestAttemptIds = (
    await Promise.all(relatedQuizzes.map(async (quiz) => (await getLatestAttemptForQuiz(quiz.id))?.id ?? null))
  ).filter((attemptId): attemptId is number => attemptId !== null)

  if (latestAttemptIds.length === 0) {
    throw new Error('No attempts found in this category yet.')
  }

  const missedQuestions = await getMissedQuestionSeedsForAttempts(latestAttemptIds)
  if (missedQuestions.length === 0) {
    throw new Error('The latest attempts in this category have no incorrect answers to remediate.')
  }

  return {
    scope: 'subject' as const,
    parentQuizId: null,
    subjectPath: normalizedSubjectPath,
    missedQuestions,
  }
}

async function getLatestAttemptForQuiz(quizId: number) {
  const db = getDb()
  const [attempt] = await db
    .select()
    .from(quizAttempts)
    .where(eq(quizAttempts.quizId, quizId))
    .orderBy(desc(quizAttempts.submittedAt), desc(quizAttempts.id))
    .limit(1)

  return attempt ?? null
}

async function getMissedQuestionSeedsForAttempts(attemptIds: number[]): Promise<RemedialQuestionSeed[]> {
  if (attemptIds.length === 0) {
    return []
  }

  const db = getDb()
  const missedAnswers = await db
    .select()
    .from(quizAttemptAnswers)
    .where(inArray(quizAttemptAnswers.attemptId, attemptIds))

  const incorrectAnswers = missedAnswers.filter((answer) => !answer.isCorrect)
  if (incorrectAnswers.length === 0) {
    return []
  }

  const questionIds = [...new Set(incorrectAnswers.map((answer) => answer.questionId))]
  const questionRows = await db
    .select({
      id: quizQuestions.id,
      quizId: quizQuestions.quizId,
      prompt: quizQuestions.prompt,
      questionType: quizQuestions.questionType,
      correctAnswer: quizQuestions.correctAnswer,
      explanation: quizQuestions.explanation,
      quizTitle: quizzes.title,
      subjectPath: quizzes.subjectPath,
    })
    .from(quizQuestions)
    .innerJoin(quizzes, eq(quizQuestions.quizId, quizzes.id))
    .where(inArray(quizQuestions.id, questionIds))

  const citationRows = await db
    .select({
      questionId: questionCitations.questionId,
      id: questionCitations.id,
      documentId: questionCitations.documentId,
      chunkId: questionCitations.chunkId,
      sectionLabel: questionCitations.sectionLabel,
      paragraphIndex: questionCitations.paragraphIndex,
      pageNumber: questionCitations.pageNumber,
      excerpt: questionCitations.excerpt,
      excerptStartOffset: questionCitations.excerptStartOffset,
      excerptEndOffset: questionCitations.excerptEndOffset,
      documentName: documents.displayName,
      chunkText: documentChunks.text,
      chunkDocumentStartOffset: documentChunks.documentStartOffset,
      chunkDocumentEndOffset: documentChunks.documentEndOffset,
    })
    .from(questionCitations)
    .innerJoin(documents, eq(questionCitations.documentId, documents.id))
    .innerJoin(documentChunks, eq(questionCitations.chunkId, documentChunks.id))
    .where(inArray(questionCitations.questionId, questionIds))
    .orderBy(asc(questionCitations.id))

  const citationsByQuestionId = new Map<number, CitationRecord[]>()
  citationRows.forEach((citation) => {
    const current = citationsByQuestionId.get(citation.questionId) ?? []
    current.push({
      id: citation.id,
      documentId: citation.documentId,
      documentName: citation.documentName,
      chunkId: citation.chunkId,
      chunkText: citation.chunkText,
      chunkDocumentStartOffset: citation.chunkDocumentStartOffset,
      chunkDocumentEndOffset: citation.chunkDocumentEndOffset,
      sectionLabel: citation.sectionLabel,
      paragraphIndex: citation.paragraphIndex,
      pageNumber: citation.pageNumber,
      excerpt: citation.excerpt,
      excerptStartOffset: citation.excerptStartOffset,
      excerptEndOffset: citation.excerptEndOffset,
    })
    citationsByQuestionId.set(citation.questionId, current)
  })

  const questionById = new Map(questionRows.map((question) => [question.id, question] as const))

  return incorrectAnswers
    .map((answer) => {
      const question = questionById.get(answer.questionId)
      if (!question) {
        return null
      }

      return {
        questionId: question.id,
        quizId: question.quizId,
        quizTitle: question.quizTitle,
        subjectPath: question.subjectPath,
        questionType: question.questionType as RemedialQuestionSeed['questionType'],
        prompt: question.prompt,
        correctAnswer: question.correctAnswer,
        selectedAnswer: answer.selectedAnswer,
        explanation: question.explanation,
        citations: citationsByQuestionId.get(question.id) ?? [],
      }
    })
    .filter((seed): seed is RemedialQuestionSeed => Boolean(seed))
}

export async function getQuizRecord(quizId: number): Promise<QuizRecord> {
  const db = getDb()
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId))

  if (!quiz) {
    throw new Error('Quiz not found')
  }

  const sourceDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.sourceCollectionId, quiz.sourceCollectionId))
    .orderBy(asc(documents.id))

  const questionRows = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quiz.id))
    .orderBy(asc(quizQuestions.position))

  const questionIds = questionRows.map((question) => question.id)
  const citationRows =
    questionIds.length > 0
      ? await db
          .select({
            id: questionCitations.id,
            questionId: questionCitations.questionId,
            documentId: questionCitations.documentId,
            chunkId: questionCitations.chunkId,
            sectionLabel: questionCitations.sectionLabel,
            paragraphIndex: questionCitations.paragraphIndex,
            pageNumber: questionCitations.pageNumber,
            excerpt: questionCitations.excerpt,
            excerptStartOffset: questionCitations.excerptStartOffset,
            excerptEndOffset: questionCitations.excerptEndOffset,
            documentName: documents.displayName,
            chunkText: documentChunks.text,
            chunkDocumentStartOffset: documentChunks.documentStartOffset,
            chunkDocumentEndOffset: documentChunks.documentEndOffset,
          })
          .from(questionCitations)
          .innerJoin(documents, eq(questionCitations.documentId, documents.id))
          .innerJoin(documentChunks, eq(questionCitations.chunkId, documentChunks.id))
          .where(inArray(questionCitations.questionId, questionIds))
          .orderBy(asc(questionCitations.id))
      : []

  const citationsByQuestionId = new Map<number, CitationRecord[]>()
  citationRows.forEach((citation) => {
    const current = citationsByQuestionId.get(citation.questionId) ?? []
    current.push({
      id: citation.id,
      documentId: citation.documentId,
      documentName: citation.documentName,
      chunkId: citation.chunkId,
      chunkText: citation.chunkText,
      chunkDocumentStartOffset: citation.chunkDocumentStartOffset,
      chunkDocumentEndOffset: citation.chunkDocumentEndOffset,
      sectionLabel: citation.sectionLabel,
      paragraphIndex: citation.paragraphIndex,
      pageNumber: citation.pageNumber,
      excerpt: citation.excerpt,
      excerptStartOffset: citation.excerptStartOffset,
      excerptEndOffset: citation.excerptEndOffset,
    })
    citationsByQuestionId.set(citation.questionId, current)
  })

  const questions: QuizQuestionRecord[] = questionRows.map((question) => ({
    id: question.id,
    position: question.position,
    questionType: question.questionType as QuizQuestionRecord['questionType'],
    prompt: question.prompt,
    options: (question.options as string[] | null) ?? null,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    citations: citationsByQuestionId.get(question.id) ?? [],
  }))

  return {
    id: quiz.id,
    generationMode: (quiz.generationMode as QuizGenerationMode) ?? 'standard',
    remedialScope: (quiz.remedialScope as RemedialScope | null) ?? null,
    parentQuizId: quiz.parentQuizId,
    sourceSubjectPath: quiz.sourceSubjectPath,
    subjectPath: quiz.subjectPath,
    title: quiz.title,
    status: quiz.status,
    provider: quiz.provider,
    model: quiz.model,
    totalQuestions: quiz.totalQuestions,
    multipleChoiceCount: quiz.multipleChoiceCount,
    trueFalseCount: quiz.trueFalseCount,
    generationNotes: quiz.generationNotes,
    createdAt: quiz.createdAt.toISOString(),
    documents: sourceDocs.map((document) => ({
      id: document.id,
      displayName: document.displayName,
      originalFileName: document.originalFileName,
      mimeType: document.mimeType,
      extractionStatus: document.extractionStatus,
      normalizationNotes: document.normalizationNotes,
      rawText: document.rawText,
    })),
    questions,
  }
}

export async function listQuizSummaries(): Promise<QuizSummaryRecord[]> {
  const db = getDb()
  const quizRows = await db.select().from(quizzes).orderBy(asc(quizzes.subjectPath), asc(quizzes.createdAt))

  if (quizRows.length === 0) {
    return []
  }

  const collectionIds = [...new Set(quizRows.map((quiz) => quiz.sourceCollectionId))]
  const quizIds = quizRows.map((quiz) => quiz.id)
  const sourceDocs = await db
    .select()
    .from(documents)
    .where(inArray(documents.sourceCollectionId, collectionIds))
    .orderBy(asc(documents.id))
  const attemptRows =
    quizIds.length > 0
      ? await db
          .select()
          .from(quizAttempts)
          .where(inArray(quizAttempts.quizId, quizIds))
          .orderBy(asc(quizAttempts.quizId), asc(quizAttempts.submittedAt))
      : []

  const documentsByCollectionId = new Map<number, QuizSummaryRecord['documents']>()
  sourceDocs.forEach((document) => {
    const current = documentsByCollectionId.get(document.sourceCollectionId) ?? []
    current.push({
      id: document.id,
      displayName: document.displayName,
      originalFileName: document.originalFileName,
    })
    documentsByCollectionId.set(document.sourceCollectionId, current)
  })
  const attemptsByQuizId = new Map<number, AttemptSummaryRecord[]>()
  attemptRows.forEach((attempt) => {
    const current = attemptsByQuizId.get(attempt.quizId) ?? []
    current.push({
      id: attempt.id,
      quizId: attempt.quizId,
      scorePercent: attempt.scorePercent,
      correctAnswers: attempt.correctAnswers,
      totalQuestions: attempt.totalQuestions,
      submittedAt: attempt.submittedAt.toISOString(),
    })
    attemptsByQuizId.set(attempt.quizId, current)
  })

  return quizRows.map((quiz) => {
    const relatedDocuments = documentsByCollectionId.get(quiz.sourceCollectionId) ?? []
    const attempts = [...(attemptsByQuizId.get(quiz.id) ?? [])].sort(
      (left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime(),
    )

    return {
      id: quiz.id,
      generationMode: (quiz.generationMode as QuizGenerationMode) ?? 'standard',
      remedialScope: (quiz.remedialScope as RemedialScope | null) ?? null,
      parentQuizId: quiz.parentQuizId,
      sourceSubjectPath: quiz.sourceSubjectPath,
      subjectPath: quiz.subjectPath,
      title: quiz.title,
      totalQuestions: quiz.totalQuestions,
      createdAt: quiz.createdAt.toISOString(),
      documentCount: relatedDocuments.length,
      documents: relatedDocuments,
      attempts,
    }
  })
}

export async function submitQuizAttempt({
  quizId,
  answers,
}: {
  quizId: number
  answers: Array<{ questionId: number; selectedAnswer: string }>
}) {
  const db = getDb()
  const questionRows = await db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(asc(quizQuestions.position))

  if (questionRows.length === 0) {
    throw new Error('Quiz not found')
  }

  const answerByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer.selectedAnswer]))
  if (answerByQuestionId.size !== questionRows.length) {
    throw new Error('Every question must be answered before submitting the quiz')
  }

  const scoredAnswers = questionRows.map((question) => {
    const selectedAnswer = answerByQuestionId.get(question.id)
    if (!selectedAnswer) {
      throw new Error('Every question must be answered before submitting the quiz')
    }

    return {
      questionId: question.id,
      selectedAnswer,
      isCorrect: normalizeAnswer(selectedAnswer) === normalizeAnswer(question.correctAnswer),
    }
  })

  const correctAnswers = scoredAnswers.filter((answer) => answer.isCorrect).length
  const scorePercent = Math.round((correctAnswers / questionRows.length) * 100)

  const [attempt] = await db
    .insert(quizAttempts)
    .values({
      quizId,
      totalQuestions: questionRows.length,
      correctAnswers,
      scorePercent,
    })
    .returning()

  await db.insert(quizAttemptAnswers).values(
    scoredAnswers.map((answer) => ({
      attemptId: attempt.id,
      questionId: answer.questionId,
      selectedAnswer: answer.selectedAnswer,
      isCorrect: answer.isCorrect,
    })),
  )

  return getAttemptRecord(attempt.id)
}

export async function getAttemptRecord(attemptId: number): Promise<AttemptRecord> {
  const db = getDb()
  const [attempt] = await db.select().from(quizAttempts).where(eq(quizAttempts.id, attemptId))

  if (!attempt) {
    throw new Error('Attempt not found')
  }

  const answers = await db
    .select()
    .from(quizAttemptAnswers)
    .where(eq(quizAttemptAnswers.attemptId, attempt.id))
    .orderBy(asc(quizAttemptAnswers.id))

  return {
    id: attempt.id,
    quizId: attempt.quizId,
    totalQuestions: attempt.totalQuestions,
    correctAnswers: attempt.correctAnswers,
    scorePercent: attempt.scorePercent,
    submittedAt: attempt.submittedAt.toISOString(),
    answers: answers.map((answer) => ({
      questionId: answer.questionId,
      selectedAnswer: answer.selectedAnswer,
      isCorrect: answer.isCorrect,
    })),
  }
}

export async function getAttemptForQuiz({ quizId, attemptId }: { quizId: number; attemptId: number }) {
  const attempt = await getAttemptRecord(attemptId)
  if (attempt.quizId !== quizId) {
    throw new Error('Attempt does not belong to this quiz')
  }

  return attempt
}

export async function updateQuizMetadata({
  quizId,
  title,
  subjectPath,
}: QuizMetadataUpdate): Promise<QuizRecord> {
  const db = getDb()
  const normalizedTitle = title.trim()
  const normalizedSubjectPath = normalizeSubjectPath(subjectPath)

  if (!normalizedTitle) {
    throw new Error('Quiz title is required')
  }

  const [existingQuiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId))
  if (!existingQuiz) {
    throw new Error('Quiz not found')
  }

  await db
    .update(quizzes)
    .set({
      title: normalizedTitle,
      subjectPath: normalizedSubjectPath,
    })
    .where(eq(quizzes.id, quizId))

  return getQuizRecord(quizId)
}

export async function deleteQuizById(quizId: number) {
  const db = getDb()
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId))
  if (!quiz) {
    return
  }

  await db.delete(sourceCollections).where(eq(sourceCollections.id, quiz.sourceCollectionId))
}

function validateGeneratedQuestionMix(
  questions: Array<{ type: string }>,
  counts: {
    totalQuestions: number
    multipleChoiceCount: number
    trueFalseCount: number
  },
) {
  if (questions.length !== counts.totalQuestions) {
    throw new Error(`Model returned ${questions.length} questions, expected ${counts.totalQuestions}`)
  }

  const multipleChoiceCount = questions.filter((question) => question.type === 'multiple_choice').length
  const trueFalseCount = questions.filter((question) => question.type === 'true_false').length

  if (multipleChoiceCount !== counts.multipleChoiceCount || trueFalseCount !== counts.trueFalseCount) {
    throw new Error(
      `Model returned an unexpected question mix. Expected ${counts.multipleChoiceCount} multiple choice and ${counts.trueFalseCount} true/false questions.`,
    )
  }
}

function normalizeAnswer(value: string) {
  return value.trim().toLowerCase()
}

function normalizeSubjectPath(value: string) {
  const normalized = value
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(' / ')

  return normalized || 'Uncategorized'
}

function findExcerptRange(chunkText: string, requestedExcerpt: string | undefined) {
  const normalizedChunkText = chunkText.trim()
  const excerpt = requestedExcerpt?.trim()

  if (!excerpt) {
    const fallback = normalizedChunkText.slice(0, Math.min(220, normalizedChunkText.length))
    return {
      excerpt: fallback,
      startOffset: 0,
      endOffset: fallback.length,
    }
  }

  const directIndex = normalizedChunkText.indexOf(excerpt)
  if (directIndex >= 0) {
    return {
      excerpt,
      startOffset: directIndex,
      endOffset: directIndex + excerpt.length,
    }
  }

  const loweredIndex = normalizedChunkText.toLowerCase().indexOf(excerpt.toLowerCase())
  if (loweredIndex >= 0) {
    return {
      excerpt: normalizedChunkText.slice(loweredIndex, loweredIndex + excerpt.length),
      startOffset: loweredIndex,
      endOffset: loweredIndex + excerpt.length,
    }
  }

  const fallback = normalizedChunkText.slice(0, Math.min(220, normalizedChunkText.length))
  return {
    excerpt: fallback,
    startOffset: 0,
    endOffset: fallback.length,
  }
}
