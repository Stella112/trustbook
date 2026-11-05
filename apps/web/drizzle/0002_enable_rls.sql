-- Supabase serves public-schema tables over its REST API using a shareable key. Enabling row-level
-- security with no policies blocks that API; the app's server role bypasses RLS and is unaffected.
ALTER TABLE "shops" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;
