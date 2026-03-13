import { describe, expect, it } from 'vitest'
import {
  buildOpenRouterRequest,
  resolveOpenRouterConfig,
  validateModelQuizPayload,
} from '#/features/quiz/openrouter'

describe('openrouter integration helpers', () => {
  it('reads the api key from the environment contract', () => {
    expect(
      resolveOpenRouterConfig({
        OPENROUTER_API_KEY: 'test-key',
        OPENROUTER_MODEL: 'openai/test-model',
      }),
    ).toEqual({
      apiKey: 'test-key',
      model: 'openai/test-model',
      siteUrl: undefined,
      appName: 'quiz-generator',
    })
  })

  it('throws when the OpenRouter API key is missing', () => {
    expect(() => resolveOpenRouterConfig({})).toThrow('OPENROUTER_API_KEY is required')
  })

  it('builds a request that asks for strict json output', () => {
    const request = buildOpenRouterRequest({
      model: 'openai/gpt-4.1-mini',
      settings: {
        totalQuestions: 6,
        multipleChoiceRatio: 50,
      },
      chunks: [
        {
          id: 12,
          documentId: 4,
          documentName: 'Doc',
          sectionLabel: 'Intro',
          paragraphIndex: 0,
          pageNumber: null,
          text: 'Important fact',
        },
      ],
    })

    expect(request.response_format).toEqual({ type: 'json_object' })
    expect(request.messages[0].role).toBe('system')
    expect(request.messages[1].content).toContain('"chunkId"')
  })

  it('accepts a valid model payload', () => {
    expect(() =>
      validateModelQuizPayload({
        quizTitle: 'Demo quiz',
        questions: [
          {
            type: 'multiple_choice',
            prompt: 'What happened?',
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'A',
            explanation: 'Because the source says so.',
            citations: [{ chunkId: 1, excerpt: 'Evidence' }],
          },
          {
            type: 'true_false',
            prompt: 'This is true?',
            correctAnswer: 'True',
            explanation: 'Supported by the source.',
            citations: [{ chunkId: 2 }],
          },
        ],
      }),
    ).not.toThrow()
  })

  it('rejects malformed question payloads', () => {
    expect(() =>
      validateModelQuizPayload({
        quizTitle: 'Broken quiz',
        questions: [
          {
            type: 'multiple_choice',
            prompt: 'Bad question',
            options: ['Only one'],
            correctAnswer: 'Only one',
            explanation: 'Nope',
            citations: [{ chunkId: 1 }],
          },
        ],
      }),
    ).toThrow('Multiple choice questions must include exactly 4 options')
  })
})
