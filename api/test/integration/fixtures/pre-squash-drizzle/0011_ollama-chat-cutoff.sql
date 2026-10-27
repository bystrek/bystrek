DELETE FROM "messages";--> statement-breakpoint
CREATE TYPE "public"."message_content_format" AS ENUM('ollama');--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "content_format" "message_content_format" DEFAULT 'ollama' NOT NULL;