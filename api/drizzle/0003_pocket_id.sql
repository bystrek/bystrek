-- Sign-in moves to Pocket ID (OIDC): no password hashes stay behind, and every
-- old session ends so the next visit signs in through Pocket ID.
DELETE FROM "accounts" WHERE "provider_id" = 'credential';--> statement-breakpoint
DELETE FROM "sessions";--> statement-breakpoint
DELETE FROM "verifications";--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "impersonated_by";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "banned";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ban_reason";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "ban_expires";--> statement-breakpoint
DROP TYPE "public"."user_status";
