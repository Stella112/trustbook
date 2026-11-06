"use server";

import { redirect } from "next/navigation";
import { endSession } from "../../src/lib/shop";

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/login");
}
