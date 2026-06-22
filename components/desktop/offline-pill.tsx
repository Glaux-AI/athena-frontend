"use client";

// OfflinePill: the single muted connectivity affordance for the desktop shell.
//
// The ONLY ambient connectivity surface, shown exclusively when the browser reports
// `navigator.onLine === false` OR main pushes a hard disconnect over `app.onConnectivity`,
// and it disappears the instant connectivity returns. No sync chrome: no "last synced", no
// conflict UI. Honest offline feedback only. Renders nothing on the web build.

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";

export function OfflinePill() {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onUp = (): void => setOnline(true);
    const onDown = (): void => setOnline(false);
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);

    let unsubscribe: (() => void) | undefined;
    if (isDesktop) {
      unsubscribe = athena.app.onConnectivity((c) => setOnline(c.online));
    }

    return () => {
      window.removeEventListener("online", onUp);
      window.removeEventListener("offline", onDown);
      unsubscribe?.();
    };
  }, []);

  if (online) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      title="You are offline. Live updates will resume automatically when the connection returns."
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs leading-snug text-[var(--text-muted)] select-none"
    >
      <WifiOff className="size-3" aria-hidden="true" />
      Offline
    </span>
  );
}
