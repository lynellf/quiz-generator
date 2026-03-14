ALTER TABLE "quizzes"
ADD COLUMN "generation_mode" text DEFAULT 'standard' NOT NULL;
--> statement-breakpoint
ALTER TABLE "quizzes"
ADD COLUMN "remedial_scope" text;
--> statement-breakpoint
ALTER TABLE "quizzes"
ADD COLUMN "parent_quiz_id" integer;
--> statement-breakpoint
ALTER TABLE "quizzes"
ADD COLUMN "source_subject_path" text;
--> statement-breakpoint
ALTER TABLE "quizzes"
ADD CONSTRAINT "quizzes_parent_quiz_id_quizzes_id_fk" FOREIGN KEY ("parent_quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;
