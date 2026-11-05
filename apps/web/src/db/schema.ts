import { bigint, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Entry } from "@trustbook/ledger";

export const shops = pgTable("shops", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerName: text("owner_name").notNull(),
  currency: text("currency").notNull().default("NGN"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  openingCashKobo: bigint("opening_cash_kobo", { mode: "number" }).notNull(),
  suiAddress: text("sui_address"),
  defaultDueDays: integer("default_due_days").notNull().default(14),
  /** DEMO shops are seeded and must be labelled as demo data everywhere. */
  mode: text("mode", { enum: ["DEMO", "LIVE"] }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    name: text("name").notNull(),
    phone: text("phone"),
    /** Owner's manual trust label, if set. Also written to behaviour memory in Phase 3. */
    labelOverride: text("label_override", { enum: ["New", "Good payer", "Sometimes late", "Careful"] }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_shop_idx").on(t.shopId)],
);

export const items = pgTable(
  "items",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    name: text("name").notNull(),
    unit: text("unit"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("items_shop_name_idx").on(t.shopId, t.name)],
);

/**
 * The append-only ledger. `data` holds the whole validated entry exactly as recorded, so daily
 * records can be rebuilt and hashed from it. The other columns copy fields out for querying.
 * A database trigger (see migrations) refuses UPDATE and DELETE.
 */
export const entries = pgTable(
  "entries",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    customerId: text("customer_id"),
    data: jsonb("data").$type<Entry>().notNull(),
  },
  (t) => [
    index("entries_shop_occurred_idx").on(t.shopId, t.occurredAt),
    index("entries_shop_recorded_idx").on(t.shopId, t.recordedAt),
    index("entries_customer_idx").on(t.shopId, t.customerId),
  ],
);
