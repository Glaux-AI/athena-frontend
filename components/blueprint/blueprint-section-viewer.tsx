"use client";

/**
 * BlueprintSectionViewer - main panel rendering one Blueprint section.
 *
 * Each section is ONE cohesive card: heading + meta on top, the body
 * markdown directly below it (so the prose reads as belonging to the
 * heading), and the source citations folded in as a divided footer.
 * The per-section actions (Edit · Lock/Unlock · Regenerate · View
 * revisions) are tucked behind a `⋮` kebab menu in the card's top-right
 * corner rather than an always-visible button row.
 *
 * Per knowledge-model.md §5.9 (F-04.1 / F-04.2). Prose bodies render through
 * the shared block-aware `ChatMarkdown` (the same renderer the chat + artifact
 * surfaces use), so summary cards / callouts / mermaid that the synthesis
 * prompts now compose render here too. The structured `body_json` path
 * (diagrams + linked node lists) is unchanged.
 */

import { Edit3, Lock, Unlock, RefreshCw, History, FileText, Sparkles, Info, AlertTriangle, MoreVertical, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { cn } from "@/lib/cn";
import type { BlueprintSection, BlueprintSectionOrigin, BlueprintSourceRef } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/utils/format";
import { BlueprintStructuredBody, SECTIONS_WITH_PROSE, hasStructuredBody } from "@/components/blueprint/blueprint-structured-body";

/**
 * Origin pill - one chip per section in the read view so the user can tell at
 * a glance whether content is auto-extracted from code (auto), LLM-synthesized
 * over sources (draft), or human-written (authored). Matches the origin
 * column on `blueprint_sections` (postgres-schema.md §5.4).
 */
const ORIGIN_LABEL: Record<BlueprintSectionOrigin, { short: string; full: string; tone: string; tooltip: string }> = {
  derived: {
    short: "auto",
    full: "Auto (derived)",
    tone: "bg-[var(--surface-2)] text-[var(--text-subtle)]",
    tooltip: "Auto-extracted from code / configs by ingestion. Refreshed on every sync. Not user-editable - change the source files to update.",
  },
  synthesized: {
    short: "draft",
    full: "Draft (synthesized)",
    tone: "bg-[var(--info-soft)] text-[var(--info-ink)]",
    tooltip: "LLM-synthesized narrative over the derived facts + uploaded resources. Editable - first edit flips Protected and future AI changes route through the approval queue.",
  },
  authored: {
    short: "authored",
    full: "Authored (human)",
    tone: "bg-[var(--primary-soft)] text-[var(--primary)]",
    tooltip: "Human-written content. AI may suggest updates via the proposal queue, never auto-applied.",
  },
};

interface BlueprintSectionViewerProps {
  section: BlueprintSection;
  onEdit: () => void;
  onLockToggle: () => Promise<void> | void;
  onRegenerate: () => Promise<void> | void;
  onViewRevisions: () => void;
  /** §5.30 row 5 - false when the caller isn't cap-admin (or org admin)
   *  on the parent scope. Disables Edit / Lock / Regenerate with a
   *  consistent "cap-admin required" tooltip. Defaults to true so the
   *  org-level Blueprint surfaces (gated separately) don't break. */
  canManage?: boolean;
  /** Blueprint scope + id - passed to `<BlueprintStructuredBody>` so the
   *  derived node-list / glossary sections paginate the whole dataset. */
  scope?: "repo" | "domain" | "org" | undefined;
  scopeId?: string | undefined;
}

export function BlueprintSectionViewer({
  section,
  onEdit,
  onLockToggle,
  onRegenerate,
  onViewRevisions,
  canManage = true,
  scope,
  scopeId,
}: BlueprintSectionViewerProps) {
  const [busy, setBusy] = useState<"lock" | "regenerate" | null>(null);
  const origin = ORIGIN_LABEL[section.origin];

  // F-04.6 - count drifted citations to drive the section-top warning + the
  // per-citation chips below the body. ``source_refs`` is null on
  // freshly-seeded / unbuilt sections (the BE column is nullable even
  // though the FE contract types it as a non-null array), so guard
  // before any array op - an unguarded `.filter` here crashed the whole
  // Blueprint tab with "Cannot read properties of null (reading 'filter')".
  const sourceRefs = section.source_refs ?? [];
  const driftedRefs = sourceRefs.filter((r) => r.drift === "stale");
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
    // One cohesive card per section - the primary content surface of the
    // Blueprint tab, so it's elevated (depth recipe §1). The left-rule
    // highlight (F-04.9) marks a user-edited section so reviewers can scan
    // touched regions at a glance.
    <Card
      variant="elevated"
      className={cn(
        section.user_edited && "border-l-4 border-l-[var(--primary)]",
      )}
    >
      <Stack gap="3">
        {/* Heading row - title + status badges on the left, the kebab actions
         * menu pinned to the top-right corner. */}
        <Cluster justify="between" align="start" gap="2" className="flex-nowrap">
          <Stack gap="1" className="min-w-0 flex-1">
            <Cluster gap="2" align="center" className="flex-wrap">
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
                  className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--warning-ink)]"
                >
                  Protected
                </span>
              )}
              {/* F-04.9 - per-section "user-edited" indicator. */}
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
          </Stack>

          <SectionActionsMenu
            section={section}
            canManage={canManage}
            busy={busy}
            onEdit={onEdit}
            onLock={handleLock}
            onRegenerate={handleRegenerate}
            onViewRevisions={onViewRevisions}
          />
        </Cluster>

        {/* F-04.6 - drift summary, inset inside the card (not a separate
         * card). Surfaces once any citation is stale; the "Regenerate
         * section" action routes through the approval queue for protected
         * sections, same as the kebab's Regenerate. */}
        {driftCount > 0 && (
          <div className="rounded-md border border-[var(--border-strong)] bg-[var(--warning-soft)] p-3">
            <Cluster justify="between" align="center" className="flex-wrap gap-2">
              <Cluster gap="2" align="center" className="min-w-0">
                <AlertTriangle className="size-4 text-[var(--warning-ink)]" aria-hidden />
                <Stack gap="0" className="min-w-0">
                  <span className="text-sm font-semibold text-[var(--warning-ink)]">
                    {driftCount} of {sourceRefs.length} citations may be stale
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
          </div>
        )}

        {/* Divider - separates the heading block from its body so the prose
         * below reads as belonging to the heading above. */}
        <div className="border-t border-[var(--border)]" aria-hidden />

        {/* Body - Phase D: structured `body_json` sections (architecture /
         * overview / portfolio / derived_* / domain_glossary) render as
         * clickable linked tables + Mermaid (contract #5); everything else
         * falls back to the markdown body. */}
        <article className="blueprint-prose">
          {hasStructuredBody(section.section_key, section.body_json) ? (
            <Stack gap="4">
              <BlueprintStructuredBody sectionKey={section.section_key} bodyJson={section.body_json!} scope={scope} scopeId={scopeId} />
              {/* Some structured sections carry body_json AND prose: diagram
               * sections (diagram + narrative) and build_and_run (manifest /
               * stack inventory + the install/run/test commands). Render BOTH -
               * the structure navigates, the prose explains. Previously the
               * structured body REPLACED the narrative, hiding the depth. */}
              {SECTIONS_WITH_PROSE.has(section.section_key) && section.body_markdown && (
                <ChatMarkdown content={stripLeadingTitleHeading(section.body_markdown, section.title)} />
              )}
            </Stack>
          ) : section.body_markdown ? (
            <ChatMarkdown content={stripLeadingTitleHeading(section.body_markdown, section.title)} />
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No body content yet.</p>
          )}
        </article>

        {/* Citations - folded into the same card as a divided footer. */}
        {sourceRefs.length > 0 && (
          <>
            <div className="border-t border-[var(--border)]" aria-hidden />
            <Stack gap="2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                Sources
              </h3>
              <ul className="flex flex-wrap gap-2">
                {sourceRefs.map((ref) => (
                  <li key={`${ref.kind}:${ref.id}`} className="inline-flex items-center gap-1">
                    <span
                      className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                      title={`${ref.kind} - ${ref.id}`}
                    >
                      <span className="font-mono text-[var(--text-subtle)]">{ref.kind}</span>{" "}
                      <span>{ref.label}</span>
                    </span>
                    {ref.drift === "stale" && <StaleCitationChip refData={ref} />}
                  </li>
                ))}
              </ul>
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}

/**
 * SectionActionsMenu - the `⋮` kebab in a section card's top-right corner.
 * Tucks Edit / Lock-Unlock / Regenerate / View-revisions out of the way so
 * the read view stays calm; opening it reveals the same actions (with the
 * same permission gating + tooltips) the old button row carried.
 *
 * Interaction follows the native popover pattern already used by
 * <ProviderFallbackPill> / the TopBar DevModeBadge: outside-click + Escape
 * close. As a true menu it adds roving Arrow/Home/End focus over the
 * enabled items. While a lock/regenerate mutation is in flight the trigger
 * itself shows the spinner (the menu has already closed).
 */
function SectionActionsMenu({
  section,
  canManage,
  busy,
  onEdit,
  onLock,
  onRegenerate,
  onViewRevisions,
}: {
  section: BlueprintSection;
  canManage: boolean;
  busy: "lock" | "regenerate" | null;
  onEdit: () => void;
  onLock: () => void;
  onRegenerate: () => void;
  onViewRevisions: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  type MenuAction = {
    key: string;
    Icon: LucideIcon;
    label: string;
    onSelect: () => void;
    disabled: boolean;
    title?: string | undefined;
    separated?: boolean;
  };

  const items: MenuAction[] = [
    {
      key: "edit",
      Icon: Edit3,
      label: "Edit",
      onSelect: onEdit,
      disabled: !canManage || !section.editable || section.locked,
      title: !canManage
        ? "Cap-admin required to edit Blueprint sections."
        : !section.editable
        ? "Derived sections are computed from the code - edit the source instead."
        : section.locked
        ? "Section is locked. Unlock to edit."
        : undefined,
    },
    {
      key: "lock",
      Icon: section.locked ? Unlock : Lock,
      label: section.locked ? "Unlock" : "Lock",
      onSelect: onLock,
      disabled: !canManage,
      title: !canManage ? "Cap-admin required to lock / unlock sections." : undefined,
    },
    {
      key: "regenerate",
      Icon: RefreshCw,
      label: "Regenerate",
      onSelect: onRegenerate,
      disabled: !canManage || section.origin === "authored",
      title: !canManage
        ? "Cap-admin required to regenerate sections."
        : section.origin === "authored"
        ? "Authored sections are user-owned. AI does not regenerate them."
        : undefined,
    },
    {
      key: "revisions",
      Icon: History,
      label: `Revisions (v${section.current_version})`,
      onSelect: onViewRevisions,
      disabled: false,
      separated: true,
    },
  ];

  const enabledIndexes = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  // Outside-click + Escape close (same native pattern as ProviderFallbackPill).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Land focus on the first actionable item when the menu opens.
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
      ?.focus();
  }, [open]);

  const select = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (enabledIndexes.length === 0) return;
    const focusAt = (n: number | undefined) => {
      if (n !== undefined) itemRefs.current[n]?.focus();
    };
    const active = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabledIndexes.indexOf(active);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusAt(pos < 0 ? enabledIndexes[0] : enabledIndexes[(pos + 1) % enabledIndexes.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(pos < 0
        ? enabledIndexes[enabledIndexes.length - 1]
        : enabledIndexes[(pos - 1 + enabledIndexes.length) % enabledIndexes.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAt(enabledIndexes[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAt(enabledIndexes[enabledIndexes.length - 1]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Section actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy !== null}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex size-8 items-center justify-center rounded-md text-[var(--text-muted)]",
          "transition-colors duration-150 ease-out",
          "hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {busy !== null ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <MoreVertical className="size-4" aria-hidden />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          aria-label="Section actions"
          onKeyDown={onPanelKeyDown}
          className="glass absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border)] py-1 shadow-[var(--shadow-3)]"
        >
          {items.map((it, i) => (
            <div key={it.key}>
              {it.separated && <div className="my-1 border-t border-[var(--border)]" aria-hidden />}
              <button
                ref={(el) => { itemRefs.current[i] = el; }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={it.disabled}
                title={it.title}
                onClick={() => select(it.onSelect)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text)]",
                  "transition-colors duration-150 ease-out hover:bg-[var(--surface-2)]",
                  "focus:bg-[var(--surface-2)] focus:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                )}
              >
                <it.Icon className="size-3.5 text-[var(--text-muted)]" aria-hidden />
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * F-04.6 - amber chip rendered next to a citation when its source has changed
 * since the section was last synced. Hover/focus reveals the at-sync vs.
 * current hash prefixes + the source-changed timestamp so power users can
 * verify why the chip surfaced.
 */
function StaleCitationChip({ refData }: { refData: BlueprintSourceRef }) {
  const atSync = refData.content_hash_at_sync?.slice(0, 7) ?? "-";
  const current = refData.current_content_hash?.slice(0, 7) ?? "-";
  const changedAt = refData.source_changed_at ? formatRelativeTime(refData.source_changed_at) : "recently";
  const tooltip = `Source updated ${changedAt}\n${atSync} (at sync) → ${current} (current)`;
  return (
    <span
      role="note"
      aria-label={`Source updated since sync. ${tooltip}`}
      title={tooltip}
      className="inline-flex items-center gap-1 rounded-full bg-[var(--warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warning-ink)]"
    >
      <Info className="size-2.5" aria-hidden />
      source updated since sync
    </span>
  );
}

/**
 * The section title is already rendered as the card heading, so a body that
 * leads with `# <Title>` would print it twice. Real BE section builders emit
 * heading-less bodies (their synthesis prompts say "no headings, markdown
 * paragraphs only"), so for live data this is a no-op - but the mock fixtures
 * (and any hand-authored section) can lead with the title, so drop that one
 * leading heading when it matches. Sub-headings (`##` …) are left intact.
 */
export function stripLeadingTitleHeading(markdown: string, title: string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && !(lines[i] ?? "").trim()) i++;
  const heading = (lines[i] ?? "").match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
  if (heading && norm(heading[1] ?? "") === norm(title)) {
    const rest = lines.slice(i + 1);
    while (rest.length && !(rest[0] ?? "").trim()) rest.shift();
    return rest.join("\n");
  }
  return markdown;
}

/**
 * Minimal markdown renderer for the Blueprint body. The FE doesn't yet ship a
 * shared markdown component; this covers the section catalog's needs:
 * headings, paragraphs, lists, GFM tables, inline code, code blocks, bold.
 *
 * Parses LINE-BY-LINE (not blank-line blocks). The old block-split renderer
 * classified each block by its first characters, so a "## Heading" block
 * swallowed any list beneath it into the heading text, and pipe tables - which
 * start with none of #/```/-/* - fell through to <p> and rendered as raw `|`
 * pipes. The line scanner emits a heading, then the list, then the table as
 * distinct nodes. Swap for a full react-markdown when the FE picks one.
 */
export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];
  const at = (n: number): string => lines[n] ?? "";
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const raw = at(i);
    const t = raw.trim();
    if (!t) { i++; continue; }

    // Fenced code block - consume until the closing fence.
    if (t.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !at(i).trim().startsWith("```")) { buf.push(at(i)); i++; }
      i++; // skip closing fence
      out.push(
        <pre key={key++} className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-xs">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // GFM table - a pipe row immediately followed by a separator row.
    if (isTableRow(raw) && isTableSeparator(at(i + 1))) {
      const header = splitRow(raw);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(at(i))) { rows.push(splitRow(at(i))); i++; }
      out.push(renderTable(key++, header, rows));
      continue;
    }

    // Headings - longest marker first.
    if (t.startsWith("### ")) { out.push(<h3 key={key++} className="text-sm font-semibold">{inlineFmt(t.slice(4))}</h3>); i++; continue; }
    if (t.startsWith("## "))  { out.push(<h2 key={key++} className="text-base font-semibold">{inlineFmt(t.slice(3))}</h2>); i++; continue; }
    if (t.startsWith("# "))   { out.push(<h1 key={key++} className="text-lg font-semibold">{inlineFmt(t.slice(2))}</h1>); i++; continue; }

    // Bullet list - consecutive `- ` / `* ` lines.
    if (isListItem(t)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(at(i).trim())) {
        items.push(at(i).trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="list-disc pl-5">
          {items.map((it, j) => <li key={j} className="pl-1">{inlineFmt(it)}</li>)}
        </ul>,
      );
      continue;
    }

    // Paragraph - gather consecutive plain lines until the next block starts.
    const para: string[] = [];
    while (i < lines.length && at(i).trim() && !isBlockStart(at(i))) { para.push(at(i).trim()); i++; }
    out.push(<p key={key++}>{inlineFmt(para.join(" "))}</p>);
  }
  return <div className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--text)]">{out}</div>;
}

function isListItem(t: string): boolean {
  return t.startsWith("- ") || t.startsWith("* ");
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.includes("-") && /^\|?[\s:|-]+\|?$/.test(t);
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((c) => c.trim());
}

function isBlockStart(line: string): boolean {
  const t = line.trim();
  return t.startsWith("#") || t.startsWith("```") || isListItem(t) || isTableRow(line);
}

function renderTable(key: number, header: string[], rows: string[][]): React.ReactNode {
  return (
    <div key={key} className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
            {header.map((h, j) => (
              <th key={j} className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{inlineFmt(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--border)] transition-colors duration-150 ease-out last:border-0 hover:bg-[var(--surface-2)]">
              {row.map((c, ci) => (
                <td key={ci} className="px-2 py-1 align-top text-[var(--text)]">{inlineFmt(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
