CREATE TYPE "public"."osm_type" AS ENUM('node', 'way', 'relation');--> statement-breakpoint
CREATE TYPE "public"."place_category" AS ENUM('restaurant', 'cafe', 'bar', 'shop', 'museum', 'attraction', 'park', 'accommodation', 'other');--> statement-breakpoint
CREATE TABLE "place_visits" (
	"user_id" uuid NOT NULL,
	"place_id" uuid NOT NULL,
	"visited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_visits_user_id_place_id_pk" PRIMARY KEY("user_id","place_id")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "place_category" NOT NULL,
	"address" text NOT NULL,
	"display_address" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"osm_type" "osm_type" NOT NULL,
	"osm_id" bigint NOT NULL,
	"notes" text,
	"url" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "place_visits" ADD CONSTRAINT "place_visits_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "place_visits_place_id_idx" ON "place_visits" USING btree ("place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "places_osm_unique" ON "places" USING btree ("osm_type","osm_id");