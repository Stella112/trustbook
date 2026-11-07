"use server";

import { redirect } from "next/navigation";
import { signOutOwner } from "../../src/lib/owner";

export async function signOut(): Promise<void> {
  await signOutOwner();
  redirect("/login");
}
