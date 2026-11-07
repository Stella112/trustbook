CREATE TABLE "reminders_sent" (
	"shop_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"date" text NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "reminders_sent" ADD CONSTRAINT "reminders_sent_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_sent_once" ON "reminders_sent" USING btree ("shop_id","customer_id","date","channel");
--> statement-breakpoint
ALTER TABLE "reminders_sent" ENABLE ROW LEVEL SECURITY;
