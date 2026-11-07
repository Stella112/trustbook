CREATE TABLE "owners" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"google_sub" text,
	"email_verified_at" timestamp with time zone,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owners_email_unique" UNIQUE("email"),
	CONSTRAINT "owners_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "password_resets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_unique" UNIQUE("owner_id");
--> statement-breakpoint
ALTER TABLE "owners" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "password_resets" ENABLE ROW LEVEL SECURITY;
