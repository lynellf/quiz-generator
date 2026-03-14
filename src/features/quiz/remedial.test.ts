import { describe, expect, it } from 'vitest'
import {
  buildRemedialQuizTitle,
  computeRemedialQuestionMix,
  prepareRemedialDocuments,
  selectRemedialSeeds,
} from '#/features/quiz/remedial'
import type { CitationRecord, RemedialQuestionSeed, SourceChunkForModel } from '#/features/quiz/types'

describe('remedial quiz helpers', () => {
  it('caps remedial seeds at the current maximum', () => {
    const seeds = Array.from({ length: 30 }, (_, index) => createSeed({ questionId: index + 1 }))

    expect(selectRemedialSeeds(seeds)).toHaveLength(25)
  })

  it('computes exact remedial question mix from missed question types', () => {
    expect(computeRemedialQuestionMix(['multiple_choice', 'true_false', 'multiple_choice'])).toEqual({
      totalQuestions: 3,
      multipleChoiceCount: 2,
      trueFalseCount: 1,
    })
  })

  it('builds synthetic remedial documents from cited chunks', () => {
    const chunks: SourceChunkForModel[] = [
      {
        id: 11,
        documentId: 4,
        documentName: 'Lecture Notes',
        sectionLabel: 'Intro',
        paragraphIndex: 0,
        pageNumber: null,
        text: 'Alpha fact',
      },
      {
        id: 15,
        documentId: 4,
        documentName: 'Lecture Notes',
        sectionLabel: 'Intro > Details',
        paragraphIndex: 1,
        pageNumber: 3,
        text: 'Beta fact',
      },
    ]

    const documents = prepareRemedialDocuments(
      chunks,
      new Map([
        [11, [createCitation({ chunkId: 11 })]],
        [15, [createCitation({ chunkId: 15 })]],
      ]),
    )

    expect(documents).toHaveLength(1)
    expect(documents[0].rawText).toContain('# Intro')
    expect(documents[0].rawText).toContain('## Details')
    expect(documents[0].chunks[0].originalChunkId).toBe(11)
    expect(documents[0].chunks[1].originalChunkId).toBe(15)
  })

  it('builds scope-aware remedial titles', () => {
    expect(buildRemedialQuizTitle({ scope: 'quiz', quizTitle: 'Civil War Review' })).toBe(
      'Remedial: Civil War Review',
    )
    expect(buildRemedialQuizTitle({ scope: 'subject', subjectPath: 'History / Civil War' })).toBe(
      'Remedial: History / Civil War',
    )
  })
})

function createSeed(overrides: Partial<RemedialQuestionSeed>): RemedialQuestionSeed {
  return {
    questionId: 1,
    quizId: 2,
    quizTitle: 'Quiz',
    subjectPath: 'Subject',
    questionType: 'multiple_choice',
    prompt: 'Prompt',
    correctAnswer: 'Correct',
    selectedAnswer: 'Wrong',
    explanation: 'Explanation',
    citations: [createCitation({})],
    ...overrides,
  }
}

function createCitation(overrides: Partial<CitationRecord>): CitationRecord {
  return {
    id: 1,
    documentId: 1,
    documentName: 'Doc',
    chunkId: 1,
    chunkText: 'Excerpted chunk',
    chunkDocumentStartOffset: 0,
    chunkDocumentEndOffset: 14,
    sectionLabel: null,
    paragraphIndex: 0,
    pageNumber: null,
    excerpt: 'Excerpt',
    excerptStartOffset: 0,
    excerptEndOffset: 7,
    ...overrides,
  }
}
