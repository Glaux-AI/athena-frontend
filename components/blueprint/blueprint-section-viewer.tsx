"use client";

/**
 * BlueprintSectionViewer — main panel rendering one Blueprint section.
 *
 * Shows: title, summary, origin badge, last-edited info, version number.
 * Action row: Edit · Lock/Unlock · Regenerate · View revisions.
 *
 * Per knowledge-model.md §5.9 (F-04.1 / F-04.2). Markdown rendering is
 * minimal — Athena hasn't standardised on a markdown engine, so we render
 * the body in a `<pre class="prose">`-style block. Future swap to a real
 * markdown component is mechanical.
 */

import { Edit3, Lock, Unlock, RefreshCw, History, FileText, Sparkles, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { BlueprintSection, BlueprintSectionOrigin, BlueprintSourceRef } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils/format";

/**
 * Origin pill — one chip per section in the read view so the user can tell at
 * a glance whether content is auto-extracted from code (auto), LLM-synthesized
 * over sources (draft), or human-written (authored). Matches the origin
 * column on `blueprint_sections` (postgres-schema.md §5.4).
 */
const ORIGIN_LABEL: Record<BlueprintSectionOrigin, { short: string; full: string; tone: string; tooltip: string }> = {
  derived: {
    short: "auto",
    full: "Auto (derived)",
    tone: "bg-[var(--surface-2)] text-[var(--text-subtle)]",
    tooltip: "Auto-extracted from code / configs by ingestion. Refreshed on every sync. Not user-editable — change the source files to update.",
  },
  synthesized: {
    short: "draft",
    full: "Draft (synthesized)",
    tone: "bg-[var(--info-soft)] text-[var(--info)]",
    tooltip: "LLM-synthesized narrative over the derived facts + uploaded resources. Editable — first edit flips Protected and future AI changes route through the approval queue.",
  },
  authored: {
    short: "authored",
    full: "Authored (human)",
    tone: "bg-[var(--primary-soft)] text-[var(--primary)]",
    tooltip: "Human-written content. AI may suggest updates via the proposal queue, never auto-applied.",
  },
};

export interface BlueprintSectionViewerProps {
  section: BlueprintSection;
  onEdit: () => void;
  onLockToggle: () => Promise<void> | void;
  onRegenerate: () => Promise<void> | void;
  onViewRevisions: () => void;
}

export function BlueprintSectionViewer({
  section,
  onEdit,
  onLockToggle,
  onRegenerate,
  onViewRevisions,
}: BlueprintSectionViewerProps) {
  const [busy, setBusy] = useState<"lock" | "regenerate" | null>(null);
  const origin = ORIGIN_LABEL[section.origin];

  // F-04.6 — count drifted citations to drive the section-top warning + the
  // per-citation chips below the body.
  const driftedRefs = section.source_refs.filter((r) => r.drift === "stale");
  const driftCount = driftedRefs.length;

  const handleLock = async () => {
    setBusy("lock");
    try { await onLockToggle(); }
    finally { setBusy(null); }
  };

  const handleRegenerate = async () => {
    setBusy("regenerate");
    try { await onRegenerate(); toast.success(`Regenerated ${section.title}.`); }
    catch { toast.error(`Couldn't regenerate ${section.title}.`); }
    finally { setBusy(null); }
  };

  return (
    <Stack gap="4">
      {/* Header */}
      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="start">
            <Stack gap="1">
              <Cluster gap="2" align="center">
                <FileText className="size-4 text-[var(--text-muted)]" aria-hidden />
                <h1 className="text-xl font-semibold leading-tight">{section.title}</h1>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    origin.tone,
                  )}
                  title={origin.tooltip}
                  aria-label={`Origin: ${origin.full}. ${origin.tooltip}`}
                >
                  <Sparkles className="size-2.5" />
                  {origin.short}
                </span>
                {section.locked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                    <Lock className="size-2.5" />
                    Locked
                  </span>
                )}
                {section.protected_from_ai && !section.locked && (
                  <span
                    title="AI updates to this section go through the approval queue"
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning)]"
                  >
                    Protected
                  </span>
                )}
                {/* F-04.9 — per-section "user-edited" indicator. */}
                {section.user_edited && (
                  <span
                    title={
                      section.last_edited_by_user_name
                        ? `Last edited by ${section.last_edited_by_user_name}${section.last_decision_id ? ` · decision ${section.last_decision_id}` : ""}`
                        : "User-edited section"
                    }
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--primary)]"
                    data-decision-id={section.last_decision_id ?? undefined}
                  >
                    <Edit3 className="size-2.5" />
                    Edited
                    {section.last_edited_at && (
                      <span className="font-normal normal-case text-[var(--text-muted)]">
                        · {formatRelativeTime(section.last_edited_at)}
                      </span>
                    )}
                  </span>
                )}
              </Cluster>
              <p className="max-w-[640px] text-sm text-[var(--text-muted)]">{section.summary}</p>
            </Stack>
          </Cluster>

          {/* Meta row */}
          <Cluster gap="3" align="center" className="text-[11px] text-[var(--text-subtle)]">
            <span>v{section.current_version}</span>
            <span aria-hidden>·</span>
            <span>{section.token_count} tokens</span>
            <span aria-hidden>·</span>
            {section.last_synced_at && (
              <>
                <span>last synced {formatIso(section.last_synced_at)}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span className="capitalize">{section.body_kind}</span>
          </Cluster>

          {/* Action row */}
          <Cluster gap="2">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              disabled={!section.editable || section.locked}
              title={
                !section.editable
                  ? "Derived sections are computed from the code — edit the source instead."
                  : section.locked
                  ? "Section is locked. Unlock to edit."
                  : undefined
              }
            >
              <Edit3 className="size-3.5" />
              Edit
            </Button>
            <Button variant="outline" size="sm" onClick={handleLock} loading={busy === "lock"}>
              {section.locked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
              {section.locked ? "Unlock" : "Lock"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRegenerate}
              loading={busy === "regenerate"}
              disabled={section.origin === "authored"}
              title={
                section.origin === "authored"
                  ? "Authored sections are user-owned. AI does not regenerate them."
                  : undefined
              }
            >
              <RefreshCw className="size-3.5" />
              Regenerate
            </Button>
            <Button variant="ghost" size="sm" onClick={onViewRevisions}>
              <History className="size-3.5" />
              Revisions (v{section.current_version})
            </Button>
          </Cluster>
        </Stack>
      </Card>

      {/* F-04.6 — section-top drift summary. Surfaces once any citation is
       * stale; the "Regenerate section" button is the same one above (and
       * routes through the approval queue for protected sections). */}
      {driftCount > 0 && (
        <Card className="border-[var(--border-strong)] bg-[var(--warning-soft)]">
          <Cluster justify="between" align="center" className="flex-wrap">
            <Cluster gap="2" align="center" className="min-w-0">
              <AlertTriangle className="size-4 text-[var(--warning)]" aria-hidden />
              <Stack gap="0" className="min-w-0">
                <span className="text-sm font-semibold text-[var(--warning)]">
                  {driftCount} of {section.source_refs.length} citations may be stale
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  Sources have changed since the section was last synced. Regenerate to refresh, or accept that the section reflects a prior snapshot.
                </span>
              </Stack>
            </Cluster>
            <Button
              size="sm"
              onClick={handleRegenerate}
              loading={busy === "regenerate"}
              disabled={section.origin === "authored"}
            >
              <RefreshCw className="size-3.5" />
              Regenerate section
            </Button>
          </Cluster>
        </Card>
      )}

      {/* F-04.9 — body card carries a left-rule highlight when the section
       * has been user-edited so reviewers can scan touched regions. */}
      <Card
        className={cn(
          section.user_edited && "border-l-4 border-l-[var(--primary)]",
        )}
      >
        <article className="blueprint-prose">
          {section.body_markdown ? (
            <MarkdownLite source={section.body_markdown} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No body content yet.</p>
          )}
        </article>
      </Card>

      {/* Citations */}
      {section.source_refs.length > 0 && (
        <Card>
          <Stack gap="2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Sources
            </h3>
            <ul className="flex flex-wrap gap-2">
              {section.source_refs.map((ref) => (
                <li key={`${ref.kind}:${ref.id}`} className="inline-flex items-center gap-1">
                  <span
                    className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                    title={`${ref.kind} — ${ref.id}`}
                  >
                    <span className="font-mono text-[var(--text-subtle)]">{ref.kind}</span>{" "}
                    <span>{ref.label}</span>
                  </span>
                  {ref.drift === "stale" && <StaleCitationChip refData={ref} />}
                </li>
              ))}
            </ul>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

/**
 * F-04.6 — amber chip rendered next to a citation when its source has changed
 * since the section was last synced. Hover/focus reveals the at-sync vs.
 * current hash prefixes + the source-changed timestamp so power users can
 * verify why the chip surfaced.
 */
function StaleCitationChip({ refData }: { refData: BlueprintSourceRef }) {
  const atSync = refData.content_hash_at_sync?.slice(0, 7) ?? "—";
  const current = refData.current_content_hash?.slice(0, 7) ?? "—";
  const changedAt = refData.source_changed_at ? formatRelativeTime(refData.source_changed_at) : "recently";
  const tooltip = `Source updated ${changedAt}\n${atSync} (at sync) → ${current} (current)`;
  return (
    <span
      role="note"
      aria-label={`Source updated since sync. ${tooltip}`}
      title={tooltip}
      className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warning)]"
    >
      <Info className="size-2.5" aria-hidden />
      source updated since sync
    </span>
  );
}

/**
 * Minimal markdown renderer for the Blueprint body. The FE doesn't yet ship a
 * shared markdown component; this covers the section catalog's needs
 * (headings, paragraphs, lists, inline code, code blocks, bold). Swap for a
 * full react-markdown when the FE picks one.
 */
function MarkdownLite({ source }: { source: string }) {
  const blocks = source.split(/\n\n+/);
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--text)]">
      {blocks.map((block, i) => {
        const t = block.trim();
        if (!t) return null;
        if (t.startsWith("```")) {
          const inner = t.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-xs"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        if (t.startsWith("# ")) return <h1 key={i} className="text-lg font-semibold">{inlineFmt(t.slice(2))}</h1>;
        if (t.startsWith("## ")) return <h2 key={i} className="text-base font-semibold">{inlineFmt(t.slice(3))}</h2>;
        if (t.startsWith("### ")) return <h3 key={i} className="text-sm font-semibold">{inlineFmt(t.slice(4))}</h3>;
        if (/^[-*] /m.test(t)) {
          const items = t.split(/\n/).filter((l) => l.trim().startsWith("- ") || l.trim().startsWith("* "));
          return (
            <ul key={i} className="list-disc pl-5">
              {items.map((it, j) => (
                <li key={j} className="pl-1">{inlineFmt(it.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{inlineFmt(t)}</p>;
      })}
    </div>
  );
}

/** Inline markdown: **bold** and `code`. Kept deliberately minimal. */
function inlineFmt(s: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let i = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    if (match.index > i) parts.push(s.slice(i, match.index));
    if (match[2]) parts.push(<strong key={parts.length}>{match[2]}</strong>);
    else if (match[4]) parts.push(<code key={parts.length} className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[11px]">{match[4]}</code>);
    i = re.lastIndex;
  }
  if (i < s.length) parts.push(s.slice(i));
  return parts;
}

function formatIso(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
