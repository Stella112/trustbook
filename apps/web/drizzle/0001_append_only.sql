-- Ledger entries are append-only: mistakes are fixed with CORRECTION entries, never by editing.
CREATE OR REPLACE FUNCTION entries_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'entries are append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER entries_no_update_delete
  BEFORE UPDATE OR DELETE ON entries
  FOR EACH ROW EXECUTE FUNCTION entries_append_only();
--> statement-breakpoint
CREATE TRIGGER entries_no_truncate
  BEFORE TRUNCATE ON entries
  FOR EACH STATEMENT EXECUTE FUNCTION entries_append_only();
