// Typed accessor for the `window.athena` surface the Electron preload exposes.
//
// Every desktop-only component reads authority through here, never `window.athena` directly,
// so the web build (where the bridge is absent) fails loudly with a clear message instead of
// a cryptic "cannot read property of undefined". Gate render of those surfaces on `isDesktop`
// first; only reach for `athena` once you know the bridge is present.

import type { AthenaBridge, DesktopPlatform } from "@/lib/desktop/types";

declare global {
  interface Window {
    athena?: AthenaBridge;
  }
}

/** True only inside the Electron desktop shell, where the preload bridge is present. */
export const isDesktop: boolean =
  typeof window !== "undefined" && typeof window.athena !== "undefined";

/** The host OS inside the desktop shell, or null on the web. Safe to read without a guard. */
export const desktopPlatform: DesktopPlatform | null =
  typeof window !== "undefined" && window.athena ? window.athena.platform : null;

/**
 * The bridge, or a thrown error if accessed on the web. Use this in every handler/effect
 * that touches local authority; gate rendering of those surfaces on `isDesktop` first.
 */
export const athena: AthenaBridge = new Proxy({} as AthenaBridge, {
  get(_target, prop: string) {
    const real = typeof window !== "undefined" ? window.athena : undefined;
    if (!real) {
      throw new Error(
        `window.athena.${prop} is unavailable: this is a desktop-only surface and the ` +
          "preload bridge is not present. Gate rendering on isDesktop before reaching for the bridge.",
      );
    }
    return real[prop as keyof AthenaBridge];
  },
});
