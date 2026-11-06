CREATE TABLE "pay_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"sale_id" text,
	"amount_kobo" bigint NOT NULL,
	"usdc_micro" bigint NOT NULL,
	"rate" text NOT NULL,
	"recipient" text NOT NULL,
	"sender" text,
	"tx_bytes" text,
	"expected_digest" text,
	"digest" text,
	"status" text DEFAULT 'quoted' NOT NULL,
	"error" text,
	"entry_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pay_quotes" ADD CONSTRAINT "pay_quotes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pay_quotes_digest_idx" ON "pay_quotes" USING btree ("digest");
--> statement-breakpoint
ALTER TABLE "pay_quotes" ENABLE ROW LEVEL SECURITY;
