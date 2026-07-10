/**
 * Athena wordmark + Sophia mascot - the single brand block in the TopBar.
 * Never duplicated anywhere else in the app.
 */

import Link from "next/link";
import { Sophia } from "@/components/mascot/sophia";
import { Pill } from "@/components/ui/pill";

export function Wordmark() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      aria-label="Athena home"
    >
      <Sophia size={28} />
      <span className="flex flex-col items-start leading-none">
        <span className="text-base font-semibold tracking-tight text-[var(--text)]">
          Athena
        </span>
        <Pill tone="primary" size="sm" className="mt-0.5">
          Beta
        </Pill>
      </span>
    </Link>
  );
}
