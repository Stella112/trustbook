import type { Metadata, Viewport } from "next";
import { Figtree, Newsreader } from "next/font/google";
import "./globals.css";

const display = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", display: "swap" });
const sans = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Trustbook",
  description: "The credit book that learns who pays, and keeps your books safe on Walrus.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-white font-sans text-stone-900 antialiased">{children}</body>
    </html>
  );
}
