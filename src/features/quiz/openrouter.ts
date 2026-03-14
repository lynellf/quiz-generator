import type {
  ModelQuestion,
  ModelQuizPayload,
  RemedialQuestionSeed,
  QuizGenerationSettings,
  SourceChunkForModel,
} from '#/features/quiz/types'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini'

export function resolveOpenRouterConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is required')
  }

  return {
    apiKey,
    model: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    siteUrl: env.OPENROUTER_SITE_URL,
    appName: env.OPENROUTER_APP_NAME || 'quiz-generator',
  }
}

export function buildOpenRouterRequest({
  settings,
  chunks,
  model,
}: {
  settings: QuizGenerationSettings
  chunks: SourceChunkForModel[]
  model: string
}) {
  const system = [
    'You generate study quizzes from source material.',
    'Return JSON only. Do not wrap it in markdown fences.',
    'Every question must cite at least one chunkId from the provided source chunks.',
    'Use only information supported by the chunks.',
    'For multiple_choice questions, return exactly 4 options and the correctAnswer must equal one option verbatim.',
    'For true_false questions, use exactly True or False as the correctAnswer.',
    'Keep explanations concise and specific.',
  ].join(' ')

  const user = JSON.stringify(
    {
      task: {
        totalQuestions: settings.totalQuestions,
        multipleChoiceRatio: settings.multipleChoiceRatio,
      },
      outputSchema: {
        quizTitle: 'string',
        questions: [
          {
            type: 'multiple_choice | true_false',
            prompt: 'string',
            options: ['string'],
            correctAnswer: 'string',
            explanation: 'string',
            citations: [
              {
                chunkId: 'number',
                excerpt: 'string',
              },
            ],
          },
        ],
      },
      chunks,
    },
    null,
    2,
  )

  return {
    model,
    temperature: 0.2,
    response_format: {
      type: 'json_object',
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
}

export function buildRemedialOpenRouterRequest({
  questionTypes,
  chunks,
  missedQuestions,
  scopeLabel,
  model,
}: {
  questionTypes: Array<ModelQuestion['type']>
  chunks: SourceChunkForModel[]
  missedQuestions: RemedialQuestionSeed[]
  scopeLabel: string
  model: string
}) {
  const counts = {
    totalQuestions: questionTypes.length,
    multipleChoiceCount: questionTypes.filter((type) => type === 'multiple_choice').length,
    trueFalseCount: questionTypes.filter((type) => type === 'true_false').length,
  }

  const system = [
    'You generate remedial study quizzes from source material.',
    'Return JSON only. Do not wrap it in markdown fences.',
    'Every question must cite at least one chunkId from the provided source chunks.',
    'Use only information supported by the chunks.',
    'Create fresh practice questions that target the same concepts as the missed questions without copying them verbatim.',
    `Return exactly ${counts.multipleChoiceCount} multiple_choice questions and ${counts.trueFalseCount} true_false questions.`,
    'For multiple_choice questions, return exactly 4 options and the correctAnswer must equal one option verbatim.',
    'For true_false questions, use exactly True or False as the correctAnswer.',
    'Keep explanations concise and specific.',
  ].join(' ')

  const user = JSON.stringify(
    {
      task: {
        remedialScope: scopeLabel,
        totalQuestions: counts.totalQuestions,
        multipleChoiceCount: counts.multipleChoiceCount,
        trueFalseCount: counts.trueFalseCount,
      },
      missedQuestions: missedQuestions.map((question) => ({
        quizTitle: question.quizTitle,
        subjectPath: question.subjectPath,
        type: question.questionType,
        prompt: question.prompt,
        userAnswer: question.selectedAnswer,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        citations: question.citations.map((citation) => ({
          chunkId: citation.chunkId,
          excerpt: citation.excerpt,
        })),
      })),
      outputSchema: {
        quizTitle: 'string',
        questions: [
          {
            type: 'multiple_choice | true_false',
            prompt: 'string',
            options: ['string'],
            correctAnswer: 'string',
            explanation: 'string',
            citations: [
              {
                chunkId: 'number',
                excerpt: 'string',
              },
            ],
          },
        ],
      },
      chunks,
    },
    null,
    2,
  )

  return {
    model,
    temperature: 0.2,
    response_format: {
      type: 'json_object',
    },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  }
}

export async function generateQuizWithOpenRouter({
  settings,
  chunks,
  env = process.env,
}: {
  settings: QuizGenerationSettings
  chunks: SourceChunkForModel[]
  env?: NodeJS.ProcessEnv
}) {
  const config = resolveOpenRouterConfig(env)
  const requestBody = buildOpenRouterRequest({
    settings,
    chunks,
    model: config.model,
  })

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(config.siteUrl ? { 'HTTP-Referer': config.siteUrl } : {}),
      ...(config.appName ? { 'X-Title': config.appName } : {}),
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`OpenRouter request failed: ${response.status} ${message}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenRouter returned an empty response')
  }

  const payload = safeJsonParse(content)
  validateModelQuizPayload(payload)

  return {
    payload,
    provider: 'openrouter',
    model: config.model,
  }
}

export async function generateRemedialQuizWithOpenRouter({
  questionTypes,
  chunks,
  missedQuestions,
  scopeLabel,
  env = process.env,
}: {
  questionTypes: Array<ModelQuestion['type']>
  chunks: SourceChunkForModel[]
  missedQuestions: RemedialQuestionSeed[]
  scopeLabel: string
  env?: NodeJS.ProcessEnv
}) {
  const config = resolveOpenRouterConfig(env)
  const requestBody = buildRemedialOpenRouterRequest({
    questionTypes,
    chunks,
    missedQuestions,
    scopeLabel,
    model: config.model,
  })

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(config.siteUrl ? { 'HTTP-Referer': config.siteUrl } : {}),
      ...(config.appName ? { 'X-Title': config.appName } : {}),
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`OpenRouter request failed: ${response.status} ${message}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenRouter returned an empty response')
  }

  const payload = safeJsonParse(content)
  validateModelQuizPayload(payload)

  return {
    payload,
    provider: 'openrouter',
    model: config.model,
  }
}

export function validateModelQuizPayload(payload: unknown): asserts payload is ModelQuizPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Model output must be a JSON object')
  }

  const quizTitle = (payload as { quizTitle?: unknown }).quizTitle
  const questions = (payload as { questions?: unknown }).questions

  if (typeof quizTitle !== 'string' || !quizTitle.trim()) {
    throw new Error('Model output is missing quizTitle')
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Model output must include at least one question')
  }

  questions.forEach(validateModelQuestion)
}

function validateModelQuestion(question: unknown): asserts question is ModelQuestion {
  if (!question || typeof question !== 'object') {
    throw new Error('Question must be an object')
  }

  const typed = question as Record<string, unknown>
  if (typed.type !== 'multiple_choice' && typed.type !== 'true_false') {
    throw new Error('Question type must be multiple_choice or true_false')
  }

  if (typeof typed.prompt !== 'string' || !typed.prompt.trim()) {
    throw new Error('Question prompt is required')
  }

  if (typeof typed.correctAnswer !== 'string' || !typed.correctAnswer.trim()) {
    throw new Error('Question correctAnswer is required')
  }

  if (typeof typed.explanation !== 'string' || !typed.explanation.trim()) {
    throw new Error('Question explanation is required')
  }

  if (!Array.isArray(typed.citations) || typed.citations.length === 0) {
    throw new Error('Each question must include citations')
  }

  typed.citations.forEach((citation) => {
    if (!citation || typeof citation !== 'object') {
      throw new Error('Citation must be an object')
    }

    const chunkId = (citation as { chunkId?: unknown }).chunkId
    if (typeof chunkId !== 'number' || !Number.isInteger(chunkId)) {
      throw new Error('Citation chunkId must be an integer')
    }
  })

  if (typed.type === 'multiple_choice') {
    if (!Array.isArray(typed.options) || typed.options.length !== 4) {
      throw new Error('Multiple choice questions must include exactly 4 options')
    }

    const options = typed.options
    if (options.some((option) => typeof option !== 'string' || !option.trim())) {
      throw new Error('Multiple choice options must be non-empty strings')
    }

    if (!options.includes(typed.correctAnswer)) {
      throw new Error('Multiple choice correctAnswer must match one option')
    }
    return
  }

  if (typed.correctAnswer !== 'True' && typed.correctAnswer !== 'False') {
    throw new Error('True/false answers must be exactly True or False')
  }
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input)
  } catch {
    const extracted = input.match(/\{[\s\S]*\}/)?.[0]
    if (!extracted) {
      throw new Error('Model output was not valid JSON')
    }

    return JSON.parse(extracted)
  }
}
