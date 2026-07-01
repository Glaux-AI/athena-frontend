import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { SessionProvider } from "@/lib/session/SessionProvider";
import { config } from "@/lib/config";
import { DesktopTitlebar } from "@/components/desktop/desktop-titlebar";
import "./globals.css";
// Desktop-only local surfaces (terminal dock, AI write-gate, worktree strip). Inert on the
// web build - the components that use these classes only mount inside the Electron shell.
import "@/components/desktop/desktop.css";

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

// Absolute base for social/canonical URLs. Social crawlers (LinkedIn/Slack/
// Twitter) resolve og:image + canonical against this - without it the image
// URL stays relative and no preview image renders. See lib/config.siteUrl.
const OG_IMAGE = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "Athena - give your coding agents the rest of your org",
};

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: "Athena - The org layer for your coding agents",
  description:
    "Athena gives your coding agents the rest of your org: shared knowledge of every repo, decision, and convention, with every change behind your team's gates.",
  applicationName: "Athena",
  authors: [{ name: "Athena Engineering" }],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Give your coding agents the rest of your org",
    description:
      "They already have the code. Athena gives them the rest: shared knowledge of every repo, decision, and convention, behind your team's gates.",
    siteName: "Athena",
    type: "website",
    url: "/",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: "Give your coding agents the rest of your org",
    description:
      "They already have the code. Athena gives them the rest: shared knowledge of every repo, decision, and convention, behind your team's gates.",
    images: [OG_IMAGE.url],
  },
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
  // tags. The CSP itself is set in middleware.ts. We also forward the
  // nonce explicitly to next-themes (it injects its own inline script in
  // <head> via dangerouslySetInnerHTML, which Next can't auto-nonce).
  const hdrs = await headers();
  const nonce = hdrs.get("x-nonce") ?? "";

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-[var(--bg)] font-sans text-[var(--text)] antialiased">
        <ThemeProvider {...(nonce ? { nonce } : {})}>
          <DesktopTitlebar />
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
