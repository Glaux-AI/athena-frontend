/**
 * Athena wordmark + Sophia mascot — the single brand block in the TopBar.
 * Never duplicated anywhere else in the app.
 */

import Link from "next/link";
import { Sophia } from "@/components/mascot/sophia";

export function Wordmark() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 rounded-md px-1 py-0.5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      aria-label="Athena home"
    >
      <Sophia size={28} />
      <span className="text-base font-semibold tracking-tight text-[var(--text)]">
        Athena
      </span>
    </Link>
  );
}
