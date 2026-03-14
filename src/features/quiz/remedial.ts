import type {
  CitationRecord,
  RemedialQuestionSeed,
  RemedialScope,
  SourceChunkForModel,
  SupportedQuestionType,
} from '#/features/quiz/types'

const MAX_REMEDIAL_QUESTIONS = 25

type PreparedRemedialDocument = {
  originalFileName: string
  displayName: string
  mimeType: string
  extension: string
  extractionStatus: 'complete'
  normalizationNotes: string
  rawText: string
  chunks: Array<{
    chunkIndex: number
    text: string
    sectionLabel: string | null
    paragraphIndex: number
    pageNumber: number | null
    documentStartOffset: number
    documentEndOffset: number
    originalChunkId: number
  }>
}

export function selectRemedialSeeds(seeds: RemedialQuestionSeed[]) {
  return seeds.slice(0, MAX_REMEDIAL_QUESTIONS)
}

export function computeRemedialQuestionMix(questionTypes: SupportedQuestionType[]) {
  return {
    totalQuestions: questionTypes.length,
    multipleChoiceCount: questionTypes.filter((type) => type === 'multiple_choice').length,
    trueFalseCount: questionTypes.filter((type) => type === 'true_false').length,
  }
}

export function buildRemedialQuizTitle({
  scope,
  quizTitle,
  subjectPath,
}: {
  scope: RemedialScope
  quizTitle?: string
  subjectPath?: string
}) {
  if (scope === 'quiz' && quizTitle) {
    return `Remedial: ${quizTitle}`
  }

  if (scope === 'subject' && subjectPath) {
    return `Remedial: ${subjectPath}`
  }

  return 'Remedial quiz'
}

export function prepareRemedialDocuments(chunks: SourceChunkForModel[], citationsByChunkId: Map<number, CitationRecord[]>) {
  const chunksByDocumentId = new Map<number, SourceChunkForModel[]>()

  chunks.forEach((chunk) => {
    const current = chunksByDocumentId.get(chunk.documentId) ?? []
    current.push(chunk)
    chunksByDocumentId.set(chunk.documentId, current)
  })

  return [...chunksByDocumentId.entries()].map(([documentId, documentChunks]) => {
    const sortedChunks = [...documentChunks].sort((left, right) => left.id - right.id)
    const rawSegments: string[] = []
    let cursor = 0
    let previousSectionLabel: string | null = null

    const preparedChunks = sortedChunks.map((chunk, index) => {
      const headingLines = buildSectionHeadingLines(previousSectionLabel, chunk.sectionLabel)
      for (const headingLine of headingLines) {
        if (cursor > 0) {
          rawSegments.push('\n\n')
          cursor += 2
        }

        rawSegments.push(headingLine)
        cursor += headingLine.length
      }

      if (cursor > 0) {
        rawSegments.push('\n\n')
        cursor += 2
      }

      const startOffset = cursor
      rawSegments.push(chunk.text)
      cursor += chunk.text.length
      previousSectionLabel = chunk.sectionLabel

      return {
        chunkIndex: index,
        text: chunk.text,
        sectionLabel: chunk.sectionLabel,
        paragraphIndex: index,
        pageNumber: chunk.pageNumber,
        documentStartOffset: startOffset,
        documentEndOffset: cursor,
        originalChunkId: chunk.id,
      }
    })

    const relatedCitations = sortedChunks.flatMap((chunk) => citationsByChunkId.get(chunk.id) ?? [])
    const displayName = sortedChunks[0]?.documentName ?? `Document ${documentId}`

    return {
      originalFileName: `${displayName}.txt`,
      displayName,
      mimeType: 'text/plain',
      extension: '.txt',
      extractionStatus: 'complete' as const,
      normalizationNotes: buildNormalizationNotes(relatedCitations.length),
      rawText: rawSegments.join(''),
      chunks: preparedChunks,
    } satisfies PreparedRemedialDocument
  })
}

function buildNormalizationNotes(citationCount: number) {
  return `Remedial quiz source is limited to ${citationCount} cited passage${citationCount === 1 ? '' : 's'} from previously missed questions.`
}

function buildSectionHeadingLines(previousSectionLabel: string | null, nextSectionLabel: string | null) {
  const previousParts = previousSectionLabel ? previousSectionLabel.split(' > ') : []
  const nextParts = nextSectionLabel ? nextSectionLabel.split(' > ') : []
  const sharedDepth = countSharedDepth(previousParts, nextParts)

  return nextParts.slice(sharedDepth).map((part, index) => `${'#'.repeat(sharedDepth + index + 1)} ${part}`)
}

function countSharedDepth(left: string[], right: string[]) {
  const maxDepth = Math.min(left.length, right.length)

  for (let index = 0; index < maxDepth; index += 1) {
    if (left[index] !== right[index]) {
      return index
    }
  }

  return maxDepth
}
