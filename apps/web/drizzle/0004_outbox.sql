CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"namespace" text NOT NULL,
	"kind" text NOT NULL,
	"customer_id" text,
	"dedupe_key" text NOT NULL,
	"content" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" text,
	"blob_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_shop_dedupe_idx" ON "outbox" USING btree ("shop_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "outbox" USING btree ("status","next_attempt_at");
--> statement-breakpoint
ALTER TABLE "outbox" ENABLE ROW LEVEL SECURITY;
