CREATE TYPE "public"."calendar_sync_status" AS ENUM('pending', 'syncing', 'ready', 'error');--> statement-breakpoint
CREATE TABLE "calendar_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"href" text NOT NULL,
	"etag" text,
	"uid" text,
	"ics" text
);
--> statement-breakpoint
CREATE TABLE "calendar_sync_state" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"calendar_url" text,
	"sync_token" text,
	"pending_sync_token" text,
	"ctag" text,
	"status" "calendar_sync_status" DEFAULT 'pending' NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"total" integer,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_objects" ADD CONSTRAINT "calendar_objects_user_id_calendar_sync_state_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."calendar_sync_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_sync_state" ADD CONSTRAINT "calendar_sync_state_user_id_calendar_credentials_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."calendar_credentials"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_objects_user_id_href_unique" ON "calendar_objects" USING btree ("user_id","href");--> statement-breakpoint
CREATE INDEX "calendar_objects_user_id_uid_idx" ON "calendar_objects" USING btree ("user_id","uid");