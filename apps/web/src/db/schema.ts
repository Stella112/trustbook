import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  /** scrypt hash of the owner's 6-digit PIN; null for the demo shop, which opens without one. */
  pinHash: text("pin_hash"),
  pinFailures: integer("pin_failures").notNull().default(0),
  pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
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
 * A Sui payment in progress (brief §6.5): the rate is locked for 30 minutes, the exact transaction
 * the server built is stored with its digest, and a digest can complete only one payment.
 */
export const payQuotes = pgTable(
  "pay_quotes",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    customerId: text("customer_id").notNull(),
    saleId: text("sale_id"),
    amountKobo: bigint("amount_kobo", { mode: "number" }).notNull(),
    usdcMicro: bigint("usdc_micro", { mode: "number" }).notNull(),
    rate: text("rate").notNull(),
    recipient: text("recipient").notNull(),
    sender: text("sender"),
    txBytes: text("tx_bytes"),
    expectedDigest: text("expected_digest"),
    digest: text("digest"),
    status: text("status", { enum: ["quoted", "built", "paid", "failed"] }).notNull().default("quoted"),
    error: text("error"),
    entryId: text("entry_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("pay_quotes_digest_idx").on(t.digest)],
);

/**
 * Every Walrus write goes through this outbox (brief §6.6): pending → submitted → confirmed | failed.
 * A memory counts only once confirmed with a blob id.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    namespace: text("namespace").notNull(),
    kind: text("kind").notNull(),
    customerId: text("customer_id"),
    dedupeKey: text("dedupe_key").notNull(),
    content: text("content").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    demo: boolean("demo").notNull().default(false),
    status: text("status", { enum: ["pending", "submitted", "confirmed", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    jobId: text("job_id"),
    blobId: text("blob_id"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("outbox_shop_dedupe_idx").on(t.shopId, t.dedupeKey), index("outbox_status_idx").on(t.status, t.nextAttemptAt)],
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
