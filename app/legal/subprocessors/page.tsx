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

import { api, type SubprocessorOut } from "@/lib/api/client";

function RowSkeleton() {
  return (
    <div className="mt-3 h-20 animate-pulse rounded-md border border-[var(--border-soft)] bg-[var(--surface-2)]" />
  );
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
      <h1 className="text-2xl font-semibold tracking-tight">Sub-processors</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
        Third parties that may process customer data on Athena&apos;s behalf, what
        they receive, where they run, and the control that gates each flow.
        Machine-readable at <code className="text-xs">/v1/legal/subprocessors</code>.
      </p>

      {error ? (
        <p className="mt-6 rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--text-muted)]">
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
                <span className="rounded-full bg-[var(--surface-2)] px-2 py-px text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                  {s.region}
                </span>
                {s.optional && (
                  <span className="rounded-full bg-[var(--primary-soft)] px-2 py-px text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
                    Opt-in
                  </span>
                )}
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
