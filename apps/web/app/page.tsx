import Link from "next/link";
import { openDemoShop } from "./onboarding/actions";
import { Logo } from "../src/ui/logo";
import { currentShop } from "../src/lib/shop";
import { MomentTabs, WindowDots } from "./welcome/tabs";

export const metadata = {
  title: "Trustbook · The credit book that learns who pays",
  description: "Record sales and credit in Pidgin or English, know who pays, get paid on Sui, and keep your books safe on Walrus.",
};

const FEATURES = [
  { title: "Speak or type", body: "“Mama Ngozi don pay 5k.” Pidgin or English, by voice or text. You check a card; nothing is saved until you confirm." },
  { title: "See the whole shop", body: "Today, this month, every day on a calendar, who owes what, and a CSV of every record whenever you want it." },
  { title: "Ask your book", body: "“Wetin happen on 14 October?” Answers come from your own records, never made-up numbers." },
  { title: "Remind on WhatsApp", body: "One tap sends a polite reminder from your own phone, with a link and QR code to pay." },
  { title: "Get paid on Sui", body: "Customers pay with USDC or any Sui token. Trustbook pays every network fee, so neither you nor your customer needs SUI for gas, and every payment is checked." },
  { title: "Your PIN guards money", body: "Marking a debt as paid or changing where money goes needs your 6-number PIN." },
];

const PROOF = [
  ["Records found", "42 day records in 9 Walrus blobs"],
  ["Anchor (Sui)", "last day 5 Nov, 42 days"],
  ["Fingerprints", "42/42 day records match"],
  ["Chain", "unbroken from the first day"],
  ["Complete vs anchor", "42 = 42, head hash matches"],
  ["Totals", "match sealed months (0 kobo diff)"],
];

export const dynamic = "force-dynamic";

/** The site's front door: everyone lands here; Get started and Log in lead into the app. */
export default async function WelcomePage() {
  // Someone already signed in gets a straight way back to their book.
  const signedIn = Boolean(await currentShop());
  return (
    <div className="bg-white text-stone-900">
      {/* Floating pill navigation */}
      <header className="sticky top-3 z-20 px-3">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-full border border-stone-200 bg-white/90 py-2 pl-5 pr-2 shadow-[0_8px_30px_-16px_rgb(14_15_12/0.35)] backdrop-blur">
          <Link href="/" aria-label="Trustbook home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-7 text-[15px] text-stone-700 md:flex">
            <a href="#how" className="hover:text-stone-900">How it works</a>
            <a href="#proof" className="hover:text-stone-900">Provable books</a>
            <Link href="/verify" className="hover:text-stone-900">Verify</Link>
            <Link href="/proof" className="hover:text-stone-900">Proof</Link>
          </div>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Link href="/today" className="btn-primary px-5 py-2 text-sm">Open your book</Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost px-4 py-2 text-sm">Log in</Link>
                <Link href="/signup" className="btn-primary px-5 py-2 text-sm">Get started</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 md:pt-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 py-1 pl-1 pr-3 text-sm text-stone-700 hover:bg-stone-100">
            <span className="rounded-full bg-lime px-2 py-0.5 text-xs font-semibold text-emerald-900">New</span>
            Pay with any Sui token
            <span aria-hidden="true">→</span>
          </Link>
          <h1 className="mt-6 text-[3.1rem] leading-[1.02] sm:text-6xl lg:text-[4.4rem]">
            The credit book
            <br />
            that learns
            <br />
            who pays
          </h1>
          <p className="mt-6 max-w-md text-xl leading-relaxed text-stone-700">
            Sales, credit and debts in Pidgin or English.
            <br />
            Remembered on Walrus. Paid and proven on Sui.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="btn-primary px-7 py-3 text-base">
              Get started, free <span aria-hidden="true">→</span>
            </Link>
            <form action={openDemoShop}>
              <button type="submit" className="btn-ghost px-6 py-3 text-base">Open the demo shop</button>
            </form>
          </div>
          <p className="mt-5 text-sm text-stone-500">Works in any phone browser. Nothing to install.</p>
        </div>

        {/* App window on a lime panel */}
        <div className="relative">
          <div className="absolute -right-4 -top-6 bottom-10 left-16 rounded-3xl bg-gradient-to-br from-lime via-[#c3d36c] to-emerald-700 opacity-90" aria-hidden="true" />
          <div className="window relative mr-6 mt-6 p-5 sm:p-6">
            <WindowDots />
            <div className="mt-5 font-display text-3xl">Today</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-600">
              <span className="rounded-full border border-stone-300 bg-white px-2.5 py-1">Sat, 7 Nov</span>
              <span className="rounded-full border border-stone-300 bg-white px-2.5 py-1">Mama Ngozi Provisions</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs text-stone-500">Sales</div>
                <div className="font-display text-2xl">₦46,400</div>
              </div>
              <div className="rounded-xl bg-white p-3">
                <div className="text-xs text-stone-500">Given on credit</div>
                <div className="font-display text-2xl">₦9,000</div>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-xl bg-white p-3 text-stone-700">“Tunde collect 2 crates egg, 9k, he go pay Friday”</div>
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <span>
                  <span className="font-semibold">Tunde</span> · ₦9,000 on credit
                </span>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900">Careful</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-stone-500">Sample shop</p>
          </div>
        </div>
      </section>

      {/* Dark band: what it is built on */}
      <section className="bg-ink py-10 text-stone-300">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-5 text-xl tracking-wide">
          <span className="text-sm uppercase tracking-[0.2em] text-stone-500">Built on</span>
          <span className="font-display text-2xl text-white">Walrus Memory</span>
          <span className="font-display text-2xl text-white">Sui</span>
          <span className="font-display text-2xl text-white">Tatum</span>
          <span className="font-display text-2xl text-white">Seal</span>
        </div>
      </section>

      {/* Before / during / after */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24">
        <h2 className="ml-auto max-w-3xl text-4xl leading-tight md:text-[3.4rem]">
          Trustbook helps you before, during and after every sale on credit.
        </h2>
        <div className="mt-16">
          <MomentTabs />
        </div>
      </section>

      {/* Provable books */}
      <section id="proof" className="scroll-mt-24 bg-stone-100 py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-2">
          <div>
            <h2 className="text-4xl leading-tight md:text-[3.4rem]">
              Books you
              <br />
              can prove
            </h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-stone-700">
              Anyone can say they back up your data. Trustbook proves it: nothing changed, nothing missing, every total adding up to the kobo, even if our own database
              is gone.
            </p>
            <Link href="/verify" className="btn-primary mt-8 px-7 py-3 text-base">
              Verify the books yourself
            </Link>
          </div>
          <div className="window bg-white p-5 sm:p-6">
            <WindowDots />
            <div className="mt-4 font-display text-2xl">Recovery report</div>
            <ul className="mt-4 divide-y divide-stone-200 text-sm">
              {PROOF.map(([step, detail]) => (
                <li key={step} className="flex items-center justify-between gap-4 py-2.5">
                  <span>
                    <span className="font-medium">{step}</span> <span className="text-stone-500">· {detail}</span>
                  </span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">PASS</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 font-display text-xl text-emerald-800">Books complete and unchanged.</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <h2 className="max-w-2xl text-4xl leading-tight md:text-[3.4rem]">Made for busy traders on busy days</h2>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-stone-200 bg-stone-50 p-6">
              <h3 className="font-display text-2xl">{f.title}</h3>
              <p className="mt-3 leading-relaxed text-stone-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-3 pb-6">
        <div className="mx-auto max-w-6xl rounded-[28px] bg-emerald-700 px-6 py-20 text-center text-white">
          <h2 className="mx-auto max-w-2xl text-4xl leading-tight md:text-6xl">Keep your book. Know who pays.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center rounded-full bg-white px-7 py-3 font-semibold text-emerald-900 hover:bg-stone-100">
              Start your book, free
            </Link>
            <form action={openDemoShop}>
              <button type="submit" className="inline-flex items-center rounded-full border border-white/40 px-6 py-3 font-medium text-white hover:bg-white/10">
                Open the demo shop
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-10 text-sm text-stone-500">
        <Logo className="text-lg" />
        <div className="flex flex-wrap gap-6">
          <Link href="/verify" className="hover:text-stone-900">Verify</Link>
          <Link href="/proof" className="hover:text-stone-900">Proof</Link>
          <a href="https://github.com/Stella112/trustbook" className="hover:text-stone-900">GitHub</a>
          <Link href="/login" className="hover:text-stone-900">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
