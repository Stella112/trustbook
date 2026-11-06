import { ledgerCsv, localDate, validateEntry } from "@trustbook/ledger";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "../../../src/db/client";
import { currentShop } from "../../../src/lib/shop";

export const dynamic = "force-dynamic";

/** The signed-in shop's whole ledger as a CSV download (brief P1). Owner session required. */
export async function GET() {
  const shop = await currentShop();
  if (!shop) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const [rows, customers, items] = await Promise.all([
    db.select({ data: schema.entries.data }).from(schema.entries).where(eq(schema.entries.shopId, shop.id)).orderBy(asc(schema.entries.recordedAt)),
    db.select({ id: schema.customers.id, name: schema.customers.name }).from(schema.customers).where(eq(schema.customers.shopId, shop.id)),
    db.select({ id: schema.items.id, name: schema.items.name }).from(schema.items).where(eq(schema.items.shopId, shop.id)),
  ]);
  const cName = new Map(customers.map((c) => [c.id, c.name]));
  const iName = new Map(items.map((i) => [i.id, i.name]));
  const csv = ledgerCsv(
    rows.map((r) => validateEntry(r.data)),
    { timezone: shop.timezone, customerName: (id) => cName.get(id) ?? id, itemName: (id) => iName.get(id) ?? id },
  );
  const today = localDate(new Date().toISOString(), shop.timezone);
  const slug = shop.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shop";
  // The byte-order mark lets Excel open the file as UTF-8 (names may hold non-ASCII letters).
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="trustbook-${slug}${shop.mode === "DEMO" ? "-demo" : ""}-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
