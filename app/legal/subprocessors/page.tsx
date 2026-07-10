"use client";

/**
 * /legal/subprocessors - the GDPR Art. 13/28/30 disclosure (§9.7).
 *
 * Renders the registry served by `GET /v1/legal/subprocessors` so the
 * public page and the machine-readable endpoint can never disagree -
 * the backend registry is the single source of truth (a new external
 * data flow ships in a PR that must touch it).
 */

import { useEffect, useState } from "react";

import { Pill } from "@/components/ui/pill";
import { api, type SubprocessorOut } from "@/lib/api/client";

function RowSkeleton() {
  return <div className="skeleton mt-3 h-20" />;
}

export default function SubprocessorsPage() {
  const [rows, setRows] = useState<SubprocessorOut[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.legal
      .subprocessors()
      .then((out) => {
        if (!cancelled) setRows(out.subprocessors);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the sub-processor list. Try again shortly.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <article>
      <header className="relative overflow-hidden rounded-xl py-8">
        <div className="starfield opacity-60" aria-hidden />
        <h1 className="relative text-2xl font-semibold tracking-tight">Sub-processors</h1>
        <p className="relative mt-3 text-sm leading-6 text-[var(--text-muted)]">
          Third parties that may process customer data on Athena&apos;s behalf, what
          they receive, where they run, and the control that gates each flow.
          Machine-readable at <code className="text-xs">/v1/legal/subprocessors</code>.
        </p>
      </header>

      {error ? (
        <p className="mt-6 rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </p>
      ) : rows === null ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((s) => (
            <li
              key={s.name}
              className="rounded-md border border-[var(--border-soft)] bg-[var(--surface)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{s.name}</span>
                <Pill tone="neutral" size="sm">{s.region}</Pill>
                {s.optional && <Pill tone="primary" size="sm">Opt-in</Pill>}
              </div>
              <p className="mt-1.5 text-sm text-[var(--text-muted)]">{s.purpose}</p>
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Data: {s.data_categories.join("; ")}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-subtle)]">Control: {s.control}</p>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
