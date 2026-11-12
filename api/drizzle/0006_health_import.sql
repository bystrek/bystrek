CREATE TABLE "health_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_events" ADD COLUMN "quantity" double precision;--> statement-breakpoint
ALTER TABLE "diary_events" ADD COLUMN "unit" text;--> statement-breakpoint
ALTER TABLE "health_imports" ADD CONSTRAINT "health_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "health_imports_user_id_idx" ON "health_imports" USING btree ("user_id");