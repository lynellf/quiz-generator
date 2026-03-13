CREATE TABLE "source_collections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "source_collections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_collection_id" integer NOT NULL,
	"original_file_name" text NOT NULL,
	"display_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"extension" text NOT NULL,
	"extraction_status" text NOT NULL,
	"raw_text" text NOT NULL,
	"normalization_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"document_id" integer NOT NULL,
	"chunk_index" integer NOT NULL,
	"section_label" text,
	"text" text NOT NULL,
	"document_start_offset" integer NOT NULL,
	"document_end_offset" integer NOT NULL,
	"paragraph_index" integer NOT NULL,
	"page_number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quizzes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source_collection_id" integer NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"total_questions" integer NOT NULL,
	"multiple_choice_count" integer NOT NULL,
	"true_false_count" integer NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"generation_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"position" integer NOT NULL,
	"question_type" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct_answer" text NOT NULL,
	"explanation" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_citations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "question_citations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"question_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"chunk_id" integer NOT NULL,
	"section_label" text,
	"paragraph_index" integer,
	"page_number" integer,
	"excerpt" text NOT NULL,
	"excerpt_start_offset" integer NOT NULL,
	"excerpt_end_offset" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"total_questions" integer NOT NULL,
	"correct_answers" integer NOT NULL,
	"score_percent" integer NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempt_answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_attempt_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attempt_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"selected_answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_collection_id_source_collections_id_fk" FOREIGN KEY ("source_collection_id") REFERENCES "public"."source_collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_source_collection_id_source_collections_id_fk" FOREIGN KEY ("source_collection_id") REFERENCES "public"."source_collections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_citations" ADD CONSTRAINT "question_citations_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_citations" ADD CONSTRAINT "question_citations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "question_citations" ADD CONSTRAINT "question_citations_chunk_id_document_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."document_chunks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "quiz_attempt_answers" ADD CONSTRAINT "quiz_attempt_answers_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;
