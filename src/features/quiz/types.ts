export type SupportedQuestionType = 'multiple_choice' | 'true_false'

export type QuizGenerationSettings = {
  totalQuestions: number
  multipleChoiceRatio: number
  subjectPath: string
}

export type QuizMetadataUpdate = {
  quizId: number
  title: string
  subjectPath: string
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
  chunkDocumentStartOffset: number
  chunkDocumentEndOffset: number
  sectionLabel: string | null
  paragraphIndex: number | null
  pageNumber: number | null
  excerpt: string
  excerptStartOffset: number
  excerptEndOffset: number
}

export type SourceDocumentRecord = {
  id: number
  displayName: string
  originalFileName: string
  mimeType: string
  extractionStatus: string
  normalizationNotes: string | null
  rawText: string
}

export type QuizRecord = {
  id: number
  subjectPath: string
  title: string
  status: string
  provider: string
  model: string
  totalQuestions: number
  multipleChoiceCount: number
  trueFalseCount: number
  generationNotes: string | null
  createdAt: string
  documents: SourceDocumentRecord[]
  questions: QuizQuestionRecord[]
}

export type QuizSummaryRecord = {
  id: number
  subjectPath: string
  title: string
  totalQuestions: number
  createdAt: string
  documentCount: number
  documents: Array<Pick<SourceDocumentRecord, 'id' | 'displayName' | 'originalFileName'>>
  attempts: AttemptSummaryRecord[]
}

export type AttemptSummaryRecord = {
  id: number
  quizId: number
  scorePercent: number
  correctAnswers: number
  totalQuestions: number
  submittedAt: string
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
