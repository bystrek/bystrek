CREATE TABLE "calendar_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"caldav_url" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"calendar_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_credentials" ADD CONSTRAINT "calendar_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_credentials_user_id_unique" ON "calendar_credentials" USING btree ("user_id");