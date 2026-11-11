CREATE TYPE "public"."diary_event_source" AS ENUM('manual', 'health');--> statement-breakpoint
CREATE TABLE "diary_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "diary_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"note_id" uuid,
	"text" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"category_id" uuid,
	"source" "diary_event_source" NOT NULL,
	"external_id" text,
	"extractor_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_events_span_order" CHECK ("diary_events"."ends_at" is null or "diary_events"."ends_at" >= "diary_events"."occurred_at")
);
--> statement-breakpoint
CREATE TABLE "diary_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"raw_text" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "diary_categories" ADD CONSTRAINT "diary_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_categories" ADD CONSTRAINT "diary_categories_parent_id_diary_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."diary_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_events" ADD CONSTRAINT "diary_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_events" ADD CONSTRAINT "diary_events_note_id_diary_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."diary_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_events" ADD CONSTRAINT "diary_events_category_id_diary_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."diary_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_notes" ADD CONSTRAINT "diary_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diary_categories_user_id_name_unique" ON "diary_categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "diary_events_user_id_source_external_id_unique" ON "diary_events" USING btree ("user_id","source","external_id");--> statement-breakpoint
CREATE INDEX "diary_events_user_id_occurred_at_idx" ON "diary_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "diary_events_note_id_idx" ON "diary_events" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "diary_events_category_id_idx" ON "diary_events" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "diary_notes_user_id_idx" ON "diary_notes" USING btree ("user_id");