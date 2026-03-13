import { asc, eq, inArray } from 'drizzle-orm'
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
import { generateQuizWithOpenRouter } from '#/features/quiz/openrouter'
import type {
  AttemptRecord,
  CitationRecord,
  ParsedUpload,
  QuizGenerationSettings,
  QuizRecord,
  QuizQuestionRecord,
  SourceChunkForModel,
} from '#/features/quiz/types'

const MAX_SOURCE_CHUNKS = 120

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

  const db = getDb()
  const [sourceCollection] = await db
    .insert(sourceCollections)
    .values({
      title:
        normalizedDocuments.length === 1
          ? normalizedDocuments[0].displayName
          : `${normalizedDocuments.length} uploaded documents`,
    })
    .returning()

  const insertedDocuments = []
  const modelChunks: SourceChunkForModel[] = []

  for (const normalizedDocument of normalizedDocuments) {
    const [document] = await db
      .insert(documents)
      .values({
        sourceCollectionId: sourceCollection.id,
        originalFileName: normalizedDocument.originalFileName,
        displayName: normalizedDocument.displayName,
        mimeType: normalizedDocument.mimeType,
        extension: normalizedDocument.extension,
        extractionStatus: normalizedDocument.extractionStatus,
        rawText: normalizedDocument.rawText,
        normalizationNotes: normalizedDocument.normalizationNotes,
      })
      .returning()

    insertedDocuments.push(document)

    const insertedChunks = await db
      .insert(documentChunks)
      .values(
        normalizedDocument.chunks.map((chunk) => ({
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

    insertedChunks.forEach((chunk) => {
      modelChunks.push({
        id: chunk.id,
        documentId: document.id,
        documentName: document.displayName,
        sectionLabel: chunk.sectionLabel,
        paragraphIndex: chunk.paragraphIndex,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
      })
    })
  }

  const generation = await generateQuizWithOpenRouter({
    settings: counts,
    chunks: modelChunks,
    env,
  })

  validateGeneratedQuestionMix(generation.payload.questions, counts)

  const [quiz] = await db
    .insert(quizzes)
    .values({
      sourceCollectionId: sourceCollection.id,
      status: 'ready',
      title: generation.payload.quizTitle,
      totalQuestions: counts.totalQuestions,
      multipleChoiceCount: counts.multipleChoiceCount,
      trueFalseCount: counts.trueFalseCount,
      provider: generation.provider,
      model: generation.model,
      generationNotes: normalizedDocuments.some((document) => document.extractionStatus === 'partial')
        ? 'At least one source used partial text extraction.'
        : null,
    })
    .returning()

  const chunkById = new Map(modelChunks.map((chunk) => [chunk.id, chunk] as const))

  for (const [index, question] of generation.payload.questions.entries()) {
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
    })),
    questions,
  }
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
