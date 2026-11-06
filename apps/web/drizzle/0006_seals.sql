CREATE TABLE "sealed_days" (
	"shop_id" text NOT NULL,
	"date" text NOT NULL,
	"hash" text NOT NULL,
	"seal_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seals" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"kind" text NOT NULL,
	"namespace" text NOT NULL,
	"from_date" text NOT NULL,
	"to_date" text NOT NULL,
	"day_count" integer NOT NULL,
	"head_hash" text NOT NULL,
	"blob_id" text NOT NULL,
	"sealed_at" timestamp with time zone NOT NULL,
	"anchor_tx" text
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "anchor_object_id" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "anchor_cap_id" text;--> statement-breakpoint
ALTER TABLE "sealed_days" ADD CONSTRAINT "sealed_days_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seals" ADD CONSTRAINT "seals_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sealed_days_pk" ON "sealed_days" USING btree ("shop_id","date");--> statement-breakpoint
CREATE INDEX "seals_shop_idx" ON "seals" USING btree ("shop_id","kind","to_date");
--> statement-breakpoint
ALTER TABLE "seals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sealed_days" ENABLE ROW LEVEL SECURITY;
