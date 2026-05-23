import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { SessionProvider } from "@/lib/session/SessionProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Athena — Enterprise PDLC Engine",
  description:
    "From a written product idea to a reviewed pull request — Athena turns a PRD into production-ready code, with humans at every gate.",
  applicationName: "Athena",
  authors: [{ name: "Athena Engineering" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c14" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts the whole layout into dynamic rendering;
  // this is what lets middleware.ts's per-request `x-nonce` reach Next's
  // inline-script renderer so it can attach `nonce="..."` to its bootstrap
  // tags. The CSP itself is set in middleware.ts.
  await headers();

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-[var(--bg)] font-sans text-[var(--text)] antialiased">
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
          <Toaster
            position="bottom-right"
            closeButton
            theme="system"
            toastOptions={{
              className: "font-sans",
              style: {
                background: "var(--surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                boxShadow: "var(--shadow-2)",
                borderRadius: "var(--radius-md)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
