import { createServerFn } from '@tanstack/react-start'
import { parseQuizGenerationFormData } from '#/features/quiz/http'
import { createQuizFromUploads, getAttemptForQuiz, getQuizRecord, submitQuizAttempt } from '#/features/quiz/store'

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
