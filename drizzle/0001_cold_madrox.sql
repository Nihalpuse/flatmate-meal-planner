DROP TABLE "sessions" CASCADE;--> statement-breakpoint
DROP TABLE "verification_tokens" CASCADE;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "timezone" text DEFAULT 'Asia/Kolkata' NOT NULL;--> statement-breakpoint
ALTER TABLE "meal_sessions" ADD COLUMN "last_generated_at" timestamp;