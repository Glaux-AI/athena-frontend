"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import { type ReactNode } from "react";

export function ThemeProvider({
  children,
  nonce,
}: {
  children: ReactNode;
  /** CSP nonce from middleware.ts — forwarded to `next-themes` so the
   * inline pre-hydration script it injects in <head> carries the
   * matching `nonce` attribute and clears `script-src 'strict-dynamic'`. */
  nonce?: string;
}) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemes>
  );
}
