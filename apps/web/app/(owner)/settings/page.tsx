import { loadBook } from "../../../src/lib/book";
import { currentOwner } from "../../../src/lib/owner";
import { Section } from "../../../src/ui/kit";
import { signOut } from "../actions";
import { AddressForm } from "./address-form";
import { TelegramConnect } from "./telegram-connect";

export const dynamic = "force-dynamic";

/** Settings (brief §6.9): where Sui payments go, the account, and demo/live mode. */
export default async function SettingsPage() {
  const { shop } = await loadBook();
  const owner = await currentOwner();
  const live = shop.mode === "LIVE";
  return (
    <>
      <h1 className="mt-1 text-3xl">Settings</h1>

      <Section title="Getting paid on Sui">
        <div className="rounded-xl bg-white p-4 border border-stone-200">
          {live ? (
            <>
              {!shop.suiAddress && (
                <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                  No address yet, so customers cannot pay you on Sui. Don&apos;t have a wallet? Install <strong>Slush</strong> (the Sui wallet from Mysten Labs), sign
                  in with Google, then connect it here.
                </p>
              )}
              <AddressForm current={shop.suiAddress} />
            </>
          ) : (
            <>
              <p className="text-stone-700">This is the demo shop. Its payments go to:</p>
              <p className="mt-1 break-all font-mono text-sm">{shop.suiAddress ?? "no address set"}</p>
              <p className="mt-2 text-sm text-stone-600">The demo shop&apos;s address cannot be changed here. Create your own account to run a real shop.</p>
            </>
          )}
        </div>
      </Section>

      <Section title="Trustbook on Telegram">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          {live ? (
            <TelegramConnect linked={Boolean(shop.telegramChatId)} />
          ) : (
            <p className="text-stone-700">Create your own account to use Trustbook from Telegram. The demo shop cannot be linked, since anyone can open it.</p>
          )}
        </div>
      </Section>

      <Section title="Your account">
        <div className="space-y-2 rounded-xl bg-white p-4 text-stone-700 border border-stone-200">
          <p>
            Shop: <span className="font-semibold">{shop.name}</span> · {live ? "Live shop" : "Demo data"}
          </p>
          {owner && <p>Signed in as {owner.email}</p>}
          <a href="/api/export" className="block underline" download>
            Download all records (CSV)
          </a>
          <form action={signOut}>
            <button type="submit" className="underline">
              Sign out
            </button>
          </form>
        </div>
      </Section>
    </>
  );
}
