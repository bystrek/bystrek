ALTER TABLE "users" ADD COLUMN "timezone" text DEFAULT 'Europe/Warsaw' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" text DEFAULT 'en-PL' NOT NULL;