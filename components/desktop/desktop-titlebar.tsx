"use client";

// A transparent, draggable strip pinned to the top of the window so a frameless desktop window
// can be moved on pages that do NOT render the app top bar (login, onboarding, error pages).
// On pages that DO render the top bar, that header sits above this strip (higher z-index) and
// owns its own drag region, so this is effectively only active pre-auth. Renders nothing on the
// web build (no bridge) and only after mount (no SSR/CSR mismatch).

import { useEffect, useState } from "react";

import { desktopPlatform, isDesktop } from "@/lib/desktop/bridge";

export function DesktopTitlebar() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Tag <html> with `desktop` + the platform here (root layout, so EVERY page including the
  // pre-auth login/onboarding screens) - the native-chrome CSS (drag regions, traffic-light /
  // window-controls padding) keys off these classes. Set in an effect (not SSR) to avoid a
  // hydration mismatch; the web build never runs this (isDesktop is false).
  useEffect(() => {
    if (!isDesktop) return;
    const root = document.documentElement;
    const platformClass = `platform-${desktopPlatform ?? "win"}`;
    root.classList.add("desktop", platformClass);
    return () => {
      root.classList.remove("desktop", platformClass);
    };
  }, []);

  if (!mounted || !isDesktop) return null;
  return <div aria-hidden className="desktop-titlebar-drag" />;
}
