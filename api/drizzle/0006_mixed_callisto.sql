ALTER TABLE "households" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "households" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "visibility" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "visibility" SET DEFAULT 'private'::text;--> statement-breakpoint
UPDATE "messages" SET "visibility" = 'shared' WHERE "visibility" = 'household';--> statement-breakpoint
DROP TYPE "public"."visibility";--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'shared');--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "visibility" SET DEFAULT 'private'::"public"."visibility";--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "visibility" SET DATA TYPE "public"."visibility" USING "visibility"::"public"."visibility";--> statement-breakpoint
DROP INDEX "users_household_id_idx";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "household_id";