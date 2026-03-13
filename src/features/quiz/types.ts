export type SupportedQuestionType = 'multiple_choice' | 'true_false'

export type QuizGenerationSettings = {
  totalQuestions: number
  multipleChoiceRatio: number
}

export type ParsedUpload = {
  originalFileName: string
  displayName: string
  mimeType: string
  extension: string
  bytes: Uint8Array
}

export type NormalizedBlock = {
  text: string
  sectionLabel: string | null
  paragraphIndex: number
  pageNumber: number | null
  startOffset: number
  endOffset: number
}

export type NormalizedChunk = {
  chunkIndex: number
  text: string
  sectionLabel: string | null
  paragraphIndex: number
  pageNumber: number | null
  documentStartOffset: number
  documentEndOffset: number
}

export type NormalizedDocument = {
  originalFileName: string
  displayName: string
  mimeType: string
  extension: string
  extractionStatus: 'complete' | 'partial'
  normalizationNotes: string | null
  rawText: string
  blocks: NormalizedBlock[]
  chunks: NormalizedChunk[]
}

export type SourceChunkForModel = {
  id: number
  documentId: number
  documentName: string
  sectionLabel: string | null
  paragraphIndex: number
  pageNumber: number | null
  text: string
}

export type ModelCitation = {
  chunkId: number
  excerpt?: string
}

export type ModelQuestion = {
  type: SupportedQuestionType
  prompt: string
  options?: string[]
  correctAnswer: string
  explanation: string
  citations: ModelCitation[]
}

export type ModelQuizPayload = {
  quizTitle: string
  questions: ModelQuestion[]
}

export type QuizQuestionRecord = {
  id: number
  position: number
  questionType: SupportedQuestionType
  prompt: string
  options: string[] | null
  correctAnswer: string
  explanation: string
  citations: CitationRecord[]
}

export type CitationRecord = {
  id: number
  documentId: number
  documentName: string
  chunkId: number
  chunkText: string
  sectionLabel: string | null
  paragraphIndex: number | null
  pageNumber: number | null
  excerpt: string
  excerptStartOffset: number
  excerptEndOffset: number
}

export type QuizRecord = {
  id: number
  title: string
  status: string
  provider: string
  model: string
  totalQuestions: number
  multipleChoiceCount: number
  trueFalseCount: number
  generationNotes: string | null
  createdAt: string
  documents: Array<{
    id: number
    displayName: string
    originalFileName: string
    mimeType: string
    extractionStatus: string
    normalizationNotes: string | null
  }>
  questions: QuizQuestionRecord[]
}

export type AttemptRecord = {
  id: number
  quizId: number
  totalQuestions: number
  correctAnswers: number
  scorePercent: number
  submittedAt: string
  answers: Array<{
    questionId: number
    selectedAnswer: string
    isCorrect: boolean
  }>
}
