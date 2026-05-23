"use client";

/**
 * DocShell — the reusable view / edit / history surface for every doc-shaped
 * artifact in Athena: spec.md, plan.md, prd.md, capability.md, runbook.md.
 *
 * Tabs:
 *   - View: rendered markdown (or a fallback `body_html` passed in).
 *   - Edit: textarea + "Save as v{n+1}" CTA.
 *   - History: list of revisions; click one to diff vs. current.
 *
 * The caller owns persistence — `onSave({ markdown, note })` should hit the
 * backend and re-fetch the doc. DocShell handles all the local-state UX.
 */

import { useEffect, useState } from "react";
import { Check, Clock, Edit3, Eye, History, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export interface DocRevision {
  id: string;
  author: string;
  authorKind: "human" | "agent";
  date: string;
  note: string;
  /** Optional one-line "what changed" summary vs. the previous revision. */
  changes?: string;
}

export interface DocShellProps {
  /** Filename / title to display in the header. */
  doc: string;
  /** Current revision label (e.g. "v3"). */
  version: string;
  /** Approval / draft state. */
  status: "draft" | "needs-review" | "approved";
  /** Pre-rendered HTML for the View tab. If absent, `markdown` is shown verbatim in a <pre>. */
  body?: string | undefined;
  /** Markdown source — what the Edit textarea shows + saves. */
  markdown?: string | undefined;
  /** Revision history (most-recent first). */
  revisions: DocRevision[];
  /** Names of people who approved the current revision. */
  approvedBy?: { name: string; role: string; avatar?: string }[] | undefined;
  /** Called when the user clicks "Save as vN+1". */
  onSave?: ((next: { markdown: string; note: string }) => Promise<void>) | undefined;
  /** Header CTA cluster (Approve / Reopen / Regenerate / Improve…). */
  headerActions?: React.ReactNode;
}

type Tab = "view" | "edit" | "history";

export function DocShell({
  doc, version, status, body, markdown, revisions, approvedBy, onSave, headerActions,
}: DocShellProps) {
  const [tab, setTab] = useState<Tab>("view");
  const [draft, setDraft] = useState(markdown ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedRevId, setSelectedRevId] = useState<string | null>(revisions[0]?.id ?? null);

  useEffect(() => { setDraft(markdown ?? ""); }, [markdown]);

  const nextVersion = `v${parseInt(version.replace(/^v/, ""), 10) + 1}`;

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave({ markdown: draft, note: note.trim() || "Manual edit" });
      setTab("view");
      setNote("");
    } finally {
      setSaving(false);
    }
  };

  const selectedRev = revisions.find((r) => r.id === selectedRevId) ?? null;

  return (
    <Card className="p-0">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <span className="text-sm font-semibold">{doc}</span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                status === "approved" ? "bg-[var(--success-soft)] text-[var(--success)]"
                : status === "needs-review" ? "bg-[var(--warning-soft)] text-[var(--warning)]"
                : "bg-[var(--primary-soft)] text-[var(--primary)]",
              )}>{status.replace("-", " ")}</span>
              <span className="text-xs text-[var(--text-muted)]">· {version}</span>
            </Cluster>
            {approvedBy && approvedBy.length > 0 && (
              <Cluster gap="2" align="center" className="text-xs text-[var(--text-muted)]">
                Approved by{" "}
                {approvedBy.map((a, i) => (
                  <span key={a.name} className="font-medium text-[var(--text)]">
                    {a.name}{i < approvedBy.length - 1 ? "," : ""}
                  </span>
                ))}
              </Cluster>
            )}
          </Stack>
          <Cluster gap="2">{headerActions}</Cluster>
        </Cluster>

        <Cluster gap="0" className="mt-3 -mb-3">
          {([
            { key: "view",    label: "View",    icon: Eye   },
            { key: "edit",    label: "Edit",    icon: Edit3 },
            { key: "history", label: "History", icon: History },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium",
                tab === t.key ? "border-[var(--primary)] text-[var(--primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
              {t.key === "history" && revisions.length > 0 && (
                <span className="rounded-full bg-[var(--surface-2)] px-1 py-0 text-[9px] text-[var(--text-muted)]">{revisions.length}</span>
              )}
            </button>
          ))}
        </Cluster>
      </div>

      <div className="p-4">
        {tab === "view" && (
          body
            ? <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] [&_h1]:mb-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_p]:mb-3 [&_p]:text-[var(--text-muted)] [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:text-[var(--text-muted)] [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--code-bg)] [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-[12px]" dangerouslySetInnerHTML={{ __html: body }} />
            : markdown
              ? <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-muted)]">{markdown}</pre>
              : <p className="text-sm text-[var(--text-muted)]">No content yet.</p>
        )}

        {tab === "edit" && (
          <Stack gap="3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px] leading-relaxed focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              placeholder="Markdown…"
            />
            <Stack gap="1.5">
              <span className="text-xs font-medium text-[var(--text-muted)]">Revision note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What did you change and why?"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </Stack>
            <Cluster justify="between" align="center">
              <span className="text-xs text-[var(--text-subtle)]">{draft.length.toLocaleString()} chars · markdown supported</span>
              <Cluster gap="2">
                <Button variant="ghost" onClick={() => { setDraft(markdown ?? ""); setNote(""); setTab("view"); }}>Discard</Button>
                <Button onClick={save} disabled={saving || draft === (markdown ?? "")}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Save as {nextVersion}
                </Button>
              </Cluster>
            </Cluster>
          </Stack>
        )}

        {tab === "history" && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr]">
            <Stack gap="1" as="ul">
              {revisions.length === 0 ? (
                <li className="text-sm text-[var(--text-muted)]">No revisions yet.</li>
              ) : revisions.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedRevId(r.id)}
                    className={cn(
                      "block w-full rounded-md border p-2 text-left text-xs transition-colors",
                      r.id === selectedRevId
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <Cluster justify="between" align="center">
                      <span className="font-mono font-semibold">{r.id}</span>
                      <Cluster gap="1" align="center">
                        {r.authorKind === "agent"
                          ? <span className="rounded bg-[var(--primary-soft)] px-1 py-0 text-[9px] uppercase tracking-wider text-[var(--primary)]">agent</span>
                          : <span className="rounded bg-[var(--surface-3)] px-1 py-0 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">human</span>}
                      </Cluster>
                    </Cluster>
                    <p className="mt-1 line-clamp-2 text-[var(--text)]">{r.note}</p>
                    {r.changes && (
                      <p className="mt-0.5 line-clamp-2 text-[var(--text-muted)]">
                        <span className="font-semibold uppercase tracking-wider text-[var(--text-subtle)]">changes</span> {r.changes}
                      </p>
                    )}
                    <Cluster gap="1" align="center" className="mt-1 text-[10px] text-[var(--text-subtle)]">
                      <Clock className="size-2.5" />
                      {r.date}
                    </Cluster>
                  </button>
                </li>
              ))}
            </Stack>
            <Card className="bg-[var(--surface-2)]">
              {selectedRev ? (
                <Stack gap="3">
                  <Stack gap="0">
                    <Cluster gap="2" align="center">
                      <span className="font-mono text-sm font-semibold">{selectedRev.id}</span>
                      {selectedRev.id === revisions[0]?.id && (
                        <span className="rounded-full bg-[var(--success-soft)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--success)]"><Check className="mr-0.5 inline size-2.5" />Current</span>
                      )}
                    </Cluster>
                    <span className="text-xs text-[var(--text-muted)]">{selectedRev.author} · {selectedRev.date}</span>
                  </Stack>
                  <p className="text-sm text-[var(--text-muted)]">{selectedRev.note}</p>
                  {selectedRev.changes && (
                    <Stack gap="1" className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">What changed</span>
                      <p className="text-xs text-[var(--text)]">{selectedRev.changes}</p>
                    </Stack>
                  )}
                </Stack>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Pick a revision on the left.</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </Card>
  );
}
