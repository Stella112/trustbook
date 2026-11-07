import { bigint, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { Entry } from "@trustbook/ledger";

/**
 * A shop owner's account (approved 6 Nov): sign in with email + password or Google. One owner has
 * one shop for now. A password and a Google account can both be linked to the same owner.
 */
export const owners = pgTable("owners", {
  id: text("id").primaryKey(),
  /** Always lower-case. */
  email: text("email").notNull().unique(),
  /** scrypt, like the PIN; null for an owner who only uses Google. */
  passwordHash: text("password_hash"),
  /** Google's stable user id ("sub"), once linked. */
  googleSub: text("google_sub").unique(),
  /** Set when the owner proved the email is theirs: by Google, or by a password-reset link. */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-time password-reset links: only a hash of the token is stored; each expires in an hour. */
export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => owners.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shops = pgTable("shops", {
  id: text("id").primaryKey(),
  /** The owner's account; null for the demo shop. Unique: one shop per owner for now. */
  ownerId: text("owner_id").unique().references(() => owners.id),
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
  /** The shop's HeadAnchor on Sui and the AnchorCap held by the server key (brief §6.8a). */
  anchorObjectId: text("anchor_object_id"),
  anchorCapId: text("anchor_cap_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    name: text("name").notNull(),
    phone: text("phone"),
    /** Optional: lets Trustbook email the customer a reminder on the day they promised to pay. */
    email: text("email"),
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
 * Reminders already sent, so the daily job never sends the same one twice. `customerId` is "owner"
 * for the owner's morning summary.
 */
export const remindersSent = pgTable(
  "reminders_sent",
  {
    shopId: text("shop_id").notNull().references(() => shops.id),
    customerId: text("customer_id").notNull(),
    date: text("date").notNull(),
    channel: text("channel", { enum: ["email"] }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminders_sent_once").on(t.shopId, t.customerId, t.date, t.channel)],
);

/**
 * What has been sealed to Walrus for Recovery Mode (brief §6.8 "local seals table"): batches of day
 * records and monthly checkpoints, with their blob ids and the anchor update that followed.
 */
export const seals = pgTable(
  "seals",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    kind: text("kind", { enum: ["batch", "month"] }).notNull(),
    namespace: text("namespace").notNull(),
    fromDate: text("from_date").notNull(),
    toDate: text("to_date").notNull(),
    dayCount: integer("day_count").notNull(),
    headHash: text("head_hash").notNull(),
    blobId: text("blob_id").notNull(),
    sealedAt: timestamp("sealed_at", { withTimezone: true }).notNull(),
    anchorTx: text("anchor_tx"),
  },
  (t) => [index("seals_shop_idx").on(t.shopId, t.kind, t.toDate)],
);

/** One row per sealed day: its hash in the chain and the batch that holds it. */
export const sealedDays = pgTable(
  "sealed_days",
  {
    shopId: text("shop_id").notNull().references(() => shops.id),
    date: text("date").notNull(),
    hash: text("hash").notNull(),
    sealId: text("seal_id").notNull(),
  },
  (t) => [uniqueIndex("sealed_days_pk").on(t.shopId, t.date)],
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
    status: text("status", { enum: ["pending", "submitted", "confirmed", "failed", "held", "summarized"] }).notNull().default("pending"),
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
