import { createServerFn } from '@tanstack/react-start'
import { parseQuizGenerationFormData } from '#/features/quiz/http'
import {
  createQuizFromUploads,
  createRemedialQuiz,
  getAttemptForQuiz,
  getQuizRecord,
  listQuizSummaries,
  submitQuizAttempt,
  updateQuizMetadata as updateQuizMetadataInStore,
} from '#/features/quiz/store'
import type { QuizMetadataUpdate } from '#/features/quiz/types'

export const generateQuiz = createServerFn({ method: 'POST' })
  .inputValidator((input: FormData) => input)
  .handler(async ({ data }) => {
    const { uploads, settings } = await parseQuizGenerationFormData(data)
    const quiz = await createQuizFromUploads({ uploads, settings })
    return { quiz }
  })

export const getQuiz = createServerFn({ method: 'GET' })
  .inputValidator((input: { quizId: number }) => input)
  .handler(async ({ data }) => {
    const quiz = await getQuizRecord(data.quizId)
    return { quiz }
  })

export const generateRemedialQuiz = createServerFn({ method: 'POST' })
  .inputValidator((input: { scope: 'quiz'; quizId: number } | { scope: 'subject'; subjectPath: string }) => input)
  .handler(async ({ data }) => {
    const quiz =
      data.scope === 'quiz'
        ? await createRemedialQuiz({ scope: 'quiz', quizId: data.quizId })
        : await createRemedialQuiz({ scope: 'subject', subjectPath: data.subjectPath })

    return { quiz }
  })

export const listQuizzes = createServerFn({ method: 'GET' })
  .inputValidator((input: Record<string, never> = {}) => input)
  .handler(async () => {
    const quizzes = await listQuizSummaries()
    return { quizzes }
  })

export const submitQuiz = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: { quizId: number; answers: Array<{ questionId: number; selectedAnswer: string }> }) => input,
  )
  .handler(async ({ data }) => {
    const attempt = await submitQuizAttempt({
      quizId: data.quizId,
      answers: data.answers,
    })

    return { attempt }
  })

export const getAttempt = createServerFn({ method: 'GET' })
  .inputValidator((input: { quizId: number; attemptId: number }) => input)
  .handler(async ({ data }) => {
    const attempt = await getAttemptForQuiz({
      quizId: data.quizId,
      attemptId: data.attemptId,
    })

    return { attempt }
  })

export const updateQuizMetadata = createServerFn({ method: 'POST' })
  .inputValidator((input: QuizMetadataUpdate) => input)
  .handler(async ({ data }) => {
    const quiz = await updateQuizMetadataInStore(data)
    return { quiz }
  })
