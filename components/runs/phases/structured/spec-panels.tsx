"use client";

/**
 * Spec-phase structured panels — body-only sub-sections for `SpecStructured`.
 *
 * These are NOT hover cards: each is a bordered `<section>` with a small
 * uppercase header so the whole spec body reads as one cohesive surface
 * inside the `PhaseDocumentShell`. The visual treatment (Primary/Touches
 * badges, mono repo names, RiskPills, warning-chip compliance gates,
 * checkbox scope rows) mirrors the proven legacy layout but binds to the
 * frozen snake_case `SpecStructured` wire fields.
 */

import { useMemo, useState } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import type { BlastRadius, DetectedCapability } from "@/lib/api/client";

import { RiskPill } from "./risk-pill";

/* -------------------------------------------------------------------------- */
/* Section primitives                                                         */
/* -------------------------------------------------------------------------- */

/** A bordered titled region — the shared shell for every structured panel. */
function Section({
  title,
  meta,
  children,
  "data-testid": testid,
}: {
  title: string;
  meta?: string | undefined;
  children: React.ReactNode;
  "data-testid"?: string;
}) {
  return (
    <section
      data-testid={testid}
      className="rounded-md border border-[var(--border)] p-3"
    >
      <Stack gap="2.5">
        <Cluster justify="between" align="center" className="gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </span>
          {meta ? (
            <span className="text-[10px] text-[var(--text-subtle)]">{meta}</span>
          ) : null}
        </Cluster>
        {children}
      </Stack>
    </section>
  );
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-[var(--text-muted)]">{children}</p>;
}

/** A small uppercase sub-heading inside a section (e.g. "Repos"). */
function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* CapabilitiesPanel                                                          */
/* -------------------------------------------------------------------------- */

export function CapabilitiesPanel({
  capabilities,
}: {
  capabilities: DetectedCapability[];
}) {
  return (
    <Section
      title="Capabilities detected"
      meta="Athena's detection"
      data-testid="capabilities-panel"
    >
      {capabilities.length === 0 ? (
        <EmptyLine>No capabilities detected.</EmptyLine>
      ) : (
        <Stack gap="2" as="ul">
          {capabilities.map((c) => (
            <li
              key={c.capability_id}
              className="rounded-md border border-[var(--border)] p-2"
            >
              <Cluster justify="between" align="center" className="gap-2">
                <Cluster gap="2" align="center" className="min-w-0">
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                      c.primary
                        ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                        : "bg-[var(--surface-2)] text-[var(--text-muted)]",
                    )}
                  >
                    {c.primary ? "Primary" : "Touches"}
                  </span>
                  <span className="truncate text-sm font-medium">{c.name}</span>
                </Cluster>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {Math.round(c.confidence * 100)}% · {c.files_estimate} file
                  {c.files_estimate === 1 ? "" : "s"}
                </span>
              </Cluster>
              {c.why ? (
                <p className="mt-1 text-xs text-[var(--text-subtle)]">{c.why}</p>
              ) : null}
            </li>
          ))}
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* BlastRadiusPanel                                                           */
/* -------------------------------------------------------------------------- */

export function BlastRadiusPanel({ blastRadius }: { blastRadius: BlastRadius | null }) {
  if (!blastRadius) {
    return (
      <Section title="Blast radius" data-testid="blast-radius-panel">
        <EmptyLine>Blast radius not computed.</EmptyLine>
      </Section>
    );
  }

  const { repos, services, data_stores, compliance } = blastRadius;
  const allEmpty =
    repos.length === 0 &&
    services.length === 0 &&
    data_stores.length === 0 &&
    compliance.length === 0;

  return (
    <Section title="Blast radius" data-testid="blast-radius-panel">
      {allEmpty ? (
        <EmptyLine>No affected repos, services, or data stores.</EmptyLine>
      ) : (
        <Stack gap="3">
          {repos.length > 0 && (
            <Stack gap="1.5">
              <SubHeading>Repos</SubHeading>
              <Stack gap="1" as="ul">
                {repos.map((r) => (
                  <li key={r.id}>
                    <Cluster justify="between" align="center" className="gap-2">
                      <Cluster gap="2" align="center" className="min-w-0">
                        <code className="truncate font-mono text-xs text-[var(--text)]">
                          {r.name}
                        </code>
                        <span className="shrink-0 rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {r.kind}
                        </span>
                      </Cluster>
                      <Cluster gap="2" align="center" className="shrink-0">
                        <span className="text-xs text-[var(--text-muted)]">
                          {r.files} file{r.files === 1 ? "" : "s"}
                        </span>
                        <RiskPill level={r.risk} />
                      </Cluster>
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          )}

          {services.length > 0 && (
            <Stack gap="1.5">
              <SubHeading>Services</SubHeading>
              <Stack gap="1" as="ul">
                {services.map((s) => (
                  <li key={s.name}>
                    <Cluster justify="between" align="center" className="gap-2 text-xs">
                      <span className="min-w-0 break-words">
                        <strong className="font-semibold">{s.name}</strong> — {s.impact}
                      </span>
                      <RiskPill level={s.risk} />
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          )}

          {data_stores.length > 0 && (
            <Stack gap="1.5">
              <SubHeading>Data stores</SubHeading>
              <Stack gap="1" as="ul">
                {data_stores.map((s) => (
                  <li key={s.name}>
                    <Cluster justify="between" align="center" className="gap-2 text-xs">
                      <span className="min-w-0 break-words">
                        <strong className="font-semibold">{s.name}</strong> — {s.impact}
                      </span>
                      <RiskPill level={s.risk} />
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          )}

          {compliance.length > 0 && (
            <Stack gap="1.5">
              <SubHeading>Compliance gates</SubHeading>
              <Cluster gap="1.5">
                {compliance.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--warning)]"
                  >
                    {c}
                  </span>
                ))}
              </Cluster>
            </Stack>
          )}
        </Stack>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* KbSourcesPanel                                                             */
/* -------------------------------------------------------------------------- */

export function KbSourcesPanel({
  sources,
}: {
  sources: { label: string; kind: string; detail: string | null; ref: string | null }[];
}) {
  return (
    <Section
      title="Knowledge sources"
      meta={sources.length > 0 ? `${sources.length} cited` : undefined}
      data-testid="kb-sources-panel"
    >
      {sources.length === 0 ? (
        <EmptyLine>No sources cited.</EmptyLine>
      ) : (
        <Cluster gap="1.5" as="nav">
          {sources.map((s, i) => (
            <span
              key={`${s.label}-${i}`}
              title={s.detail ?? undefined}
              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs"
            >
              <span className="font-semibold text-[var(--text)]">{s.label}</span>
              <span className="text-[var(--text-muted)]"> · {s.kind}</span>
            </span>
          ))}
        </Cluster>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* ScopeSelector                                                              */
/* -------------------------------------------------------------------------- */

/**
 * ScopeSelector — checkbox/toggle rows over the detected capabilities and the
 * blast-radius repos. Selecting a subset and hitting "Apply scope & iterate"
 * fires `onApply(capabilityIds, repoIds)`, which the spec body wires to the
 * `documents:improve` call (carrying `scope_capability_ids` / `scope_repo_ids`).
 * Defaults to the primary capabilities + all repos pre-selected, matching the
 * legacy behaviour.
 */
export function ScopeSelector({
  capabilities,
  repos,
  onApply,
  applying,
}: {
  capabilities: DetectedCapability[];
  repos: { id: string; name: string }[];
  onApply: (capabilityIds: string[], repoIds: string[]) => void;
  applying: boolean;
}) {
  const [selectedCaps, setSelectedCaps] = useState<Set<string>>(
    () => new Set(capabilities.filter((c) => c.primary).map((c) => c.capability_id)),
  );
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(
    () => new Set(repos.map((r) => r.id)),
  );

  const total = useMemo(
    () => selectedCaps.size + selectedRepos.size,
    [selectedCaps, selectedRepos],
  );

  if (capabilities.length === 0 && repos.length === 0) return null;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };

  return (
    <Section title="Re-scope &amp; iterate" data-testid="scope-selector">
      <Stack gap="3">
        {capabilities.length > 0 && (
          <Stack gap="1.5">
            <SubHeading>Capabilities</SubHeading>
            <Stack gap="1" as="ul">
              {capabilities.map((c) => (
                <li key={c.capability_id}>
                  <ToggleRow
                    selected={selectedCaps.has(c.capability_id)}
                    onToggle={() =>
                      toggle(selectedCaps, setSelectedCaps, c.capability_id)
                    }
                    label={c.name}
                  />
                </li>
              ))}
            </Stack>
          </Stack>
        )}

        {repos.length > 0 && (
          <Stack gap="1.5">
            <SubHeading>Repos</SubHeading>
            <Stack gap="1" as="ul">
              {repos.map((r) => (
                <li key={r.id}>
                  <ToggleRow
                    selected={selectedRepos.has(r.id)}
                    onToggle={() => toggle(selectedRepos, setSelectedRepos, r.id)}
                    label={r.name}
                    mono
                  />
                </li>
              ))}
            </Stack>
          </Stack>
        )}

        <Cluster justify="between" align="center" className="gap-2 pt-1">
          <span className="text-xs text-[var(--text-muted)]">{total} selected</span>
          <Button
            size="sm"
            disabled={total === 0 || applying}
            loading={applying}
            onClick={() =>
              onApply(Array.from(selectedCaps), Array.from(selectedRepos))
            }
            data-testid="scope-apply"
          >
            {!applying && <Sparkles className="size-3.5" />}
            Apply scope &amp; iterate
          </Button>
        </Cluster>
      </Stack>
    </Section>
  );
}

function ToggleRow({
  selected,
  onToggle,
  label,
  mono,
}: {
  selected: boolean;
  onToggle: () => void;
  label: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        selected
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded border",
          selected
            ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-fg)]"
            : "border-[var(--border-strong)] bg-[var(--surface)]",
        )}
      >
        {selected && <CheckCircle2 className="size-3" />}
      </span>
      {mono ? (
        <code className="truncate font-mono text-xs text-[var(--text)]">{label}</code>
      ) : (
        <span className="truncate text-sm font-medium">{label}</span>
      )}
    </button>
  );
}
