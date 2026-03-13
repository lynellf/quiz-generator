import type { ParsedUpload, QuizGenerationSettings } from '#/features/quiz/types'

export async function parseQuizGenerationFormData(formData: FormData) {
  const files = formData.getAll('files')
  if (files.length === 0) {
    throw new Error('Upload at least one file')
  }

  const totalQuestions = parseInteger(formData.get('totalQuestions'), 'totalQuestions')
  const multipleChoiceRatio = parseInteger(formData.get('multipleChoiceRatio'), 'multipleChoiceRatio')
  const displayNames = parseDisplayNames(formData.get('displayNames'))

  const uploads: ParsedUpload[] = []
  for (const [index, entry] of files.entries()) {
    if (!(entry instanceof File)) {
      throw new Error('Invalid file upload payload')
    }

    const bytes = new Uint8Array(await entry.arrayBuffer())
    uploads.push({
      originalFileName: entry.name,
      displayName: displayNames[index] || removeExtension(entry.name),
      mimeType: entry.type || inferMimeType(entry.name),
      extension: getExtension(entry.name),
      bytes,
    })
  }

  const settings: QuizGenerationSettings = {
    totalQuestions,
    multipleChoiceRatio,
  }

  return { uploads, settings }
}

export async function parseAttemptRequest(request: Request) {
  const json = (await request.json()) as {
    answers?: Array<{ questionId?: unknown; selectedAnswer?: unknown }>
  }

  if (!Array.isArray(json.answers)) {
    throw new Error('answers must be an array')
  }

  return {
    answers: json.answers.map((answer) => {
      if (typeof answer.questionId !== 'number' || !Number.isInteger(answer.questionId)) {
        throw new Error('Each answer must include an integer questionId')
      }

      if (typeof answer.selectedAnswer !== 'string' || !answer.selectedAnswer.trim()) {
        throw new Error('Each answer must include a selectedAnswer')
      }

      return {
        questionId: answer.questionId,
        selectedAnswer: answer.selectedAnswer,
      }
    }),
  }
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(init?.headers ?? {}),
    },
  })
}

export function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : 'Unexpected error'
  return jsonResponse({ error: message }, { status })
}

function parseDisplayNames(value: FormDataEntryValue | null) {
  if (!value) {
    return [] as string[]
  }

  if (typeof value !== 'string') {
    throw new Error('displayNames must be a JSON array')
  }

  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('displayNames must be a JSON array')
  }

  return parsed.map((item) => (typeof item === 'string' ? item.trim() : ''))
}

function parseInteger(value: FormDataEntryValue | null, fieldName: string) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be provided`)
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be an integer`)
  }

  return parsed
}

function getExtension(filename: string) {
  const lastDotIndex = filename.lastIndexOf('.')
  return lastDotIndex >= 0 ? filename.slice(lastDotIndex).toLowerCase() : ''
}

function removeExtension(filename: string) {
  const extension = getExtension(filename)
  return extension ? filename.slice(0, -extension.length) : filename
}

function inferMimeType(filename: string) {
  const extension = getExtension(filename)

  switch (extension) {
    case '.md':
    case '.markdown':
      return 'text/markdown'
    case '.html':
    case '.htm':
      return 'text/html'
    case '.pdf':
      return 'application/pdf'
    default:
      return 'text/plain'
  }
}
