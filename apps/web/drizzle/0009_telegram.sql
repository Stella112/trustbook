CREATE TABLE "telegram_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"token" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "telegram_chat_id" text;--> statement-breakpoint
ALTER TABLE "telegram_cards" ADD CONSTRAINT "telegram_cards_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_telegram_chat_id_unique" UNIQUE("telegram_chat_id");
--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "telegram_cards" ENABLE ROW LEVEL SECURITY;
