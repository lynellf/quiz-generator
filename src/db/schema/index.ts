import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  name: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sourceCollections = pgTable('source_collections', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  title: text(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const documents = pgTable('documents', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  sourceCollectionId: integer('source_collection_id')
    .references(() => sourceCollections.id, { onDelete: 'cascade' })
    .notNull(),
  originalFileName: text('original_file_name').notNull(),
  displayName: text('display_name').notNull(),
  mimeType: text('mime_type').notNull(),
  extension: text('extension').notNull(),
  extractionStatus: text('extraction_status').notNull(),
  rawText: text('raw_text').notNull(),
  normalizationNotes: text('normalization_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const documentChunks = pgTable('document_chunks', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  documentId: integer('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  chunkIndex: integer('chunk_index').notNull(),
  sectionLabel: text('section_label'),
  text: text().notNull(),
  documentStartOffset: integer('document_start_offset').notNull(),
  documentEndOffset: integer('document_end_offset').notNull(),
  paragraphIndex: integer('paragraph_index').notNull(),
  pageNumber: integer('page_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const quizzes = pgTable('quizzes', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  sourceCollectionId: integer('source_collection_id')
    .references(() => sourceCollections.id, { onDelete: 'cascade' })
    .notNull(),
  status: text().notNull(),
  title: text().notNull(),
  totalQuestions: integer('total_questions').notNull(),
  multipleChoiceCount: integer('multiple_choice_count').notNull(),
  trueFalseCount: integer('true_false_count').notNull(),
  provider: text().notNull(),
  model: text().notNull(),
  generationNotes: text('generation_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const quizQuestions = pgTable('quiz_questions', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  quizId: integer('quiz_id')
    .references(() => quizzes.id, { onDelete: 'cascade' })
    .notNull(),
  position: integer().notNull(),
  questionType: text('question_type').notNull(),
  prompt: text().notNull(),
  options: jsonb().$type<string[] | null>(),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const questionCitations = pgTable('question_citations', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  questionId: integer('question_id')
    .references(() => quizQuestions.id, { onDelete: 'cascade' })
    .notNull(),
  documentId: integer('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  chunkId: integer('chunk_id')
    .references(() => documentChunks.id, { onDelete: 'cascade' })
    .notNull(),
  sectionLabel: text('section_label'),
  paragraphIndex: integer('paragraph_index'),
  pageNumber: integer('page_number'),
  excerpt: text().notNull(),
  excerptStartOffset: integer('excerpt_start_offset').notNull(),
  excerptEndOffset: integer('excerpt_end_offset').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const quizAttempts = pgTable('quiz_attempts', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  quizId: integer('quiz_id')
    .references(() => quizzes.id, { onDelete: 'cascade' })
    .notNull(),
  totalQuestions: integer('total_questions').notNull(),
  correctAnswers: integer('correct_answers').notNull(),
  scorePercent: integer('score_percent').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
})

export const quizAttemptAnswers = pgTable('quiz_attempt_answers', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  attemptId: integer('attempt_id')
    .references(() => quizAttempts.id, { onDelete: 'cascade' })
    .notNull(),
  questionId: integer('question_id')
    .references(() => quizQuestions.id, { onDelete: 'cascade' })
    .notNull(),
  selectedAnswer: text('selected_answer').notNull(),
  isCorrect: boolean('is_correct').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type SourceCollection = typeof sourceCollections.$inferSelect
export type NewSourceCollection = typeof sourceCollections.$inferInsert

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert

export type DocumentChunk = typeof documentChunks.$inferSelect
export type NewDocumentChunk = typeof documentChunks.$inferInsert

export type Quiz = typeof quizzes.$inferSelect
export type NewQuiz = typeof quizzes.$inferInsert

export type QuizQuestion = typeof quizQuestions.$inferSelect
export type NewQuizQuestion = typeof quizQuestions.$inferInsert

export type QuestionCitation = typeof questionCitations.$inferSelect
export type NewQuestionCitation = typeof questionCitations.$inferInsert

export type QuizAttempt = typeof quizAttempts.$inferSelect
export type NewQuizAttempt = typeof quizAttempts.$inferInsert

export type QuizAttemptAnswer = typeof quizAttemptAnswers.$inferSelect
export type NewQuizAttemptAnswer = typeof quizAttemptAnswers.$inferInsert
