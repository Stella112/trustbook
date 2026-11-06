ALTER TABLE "shops" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "pin_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ADD COLUMN "pin_locked_until" timestamp with time zone;