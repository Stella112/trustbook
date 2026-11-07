import { redirect } from "next/navigation";

/** Old address of the landing page; it now lives at /. */
export default function Welcome() {
  redirect("/");
}
