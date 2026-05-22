"use client";

/**
 * /rules — Decision Records.
 *
 * The durable record of how the team works: architecture decisions (ADRs),
 * conventions, and domain notes. Athena reads these before every task so the
 * spec / plan / review phases never violate a documented decision.
 */

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, FileText, Loader2, Plus, ScrollText, Search, StickyNote, Tag,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type DecisionRecord } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const KIND_META: Record<DecisionRecord["kind"], { icon: typeof BookOpen; label: string; description: string; tone: string }> = {
  ADR:           { icon: BookOpen,   label: "Decision records (ADRs)", description: "Architecture decisions, append-only, supersede each other.",   tone: "text-[var(--primary)]" },
  Convention:    { icon: ScrollText, label: "Conventions",              description: "How we write code: style guides, lint rules, naming.",          tone: "text-[var(--info)]" },
  "Domain note": { icon: StickyNote, label: "Domain notes",             description: "Small but durable rules surfaced during work — promoted from chat.", tone: "text-[var(--warning)]" },
};

export default function RulesPage() {
  const [rules, setRules] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [selected, setSelected] = useState<DecisionRecord | null>(null);

  useEffect(() => {
    (async () => {
      try { setRules(await api.rules.list()); }
      catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load decision records"); }
      finally { setLoading(false); }
    })();
  }, []);

  const allTags = useMemo(() => Array.from(new Set(rules.map((r) => r.tag))).sort(), [rules]);

  const filtered = useMemo(() => {
    return rules.filter((r) => {
      if (tagFilter && r.tag !== tagFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        return r.id.toLowerCase().includes(q) || r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q);
      }
      return true;
    });
  }, [rules, query, tagFilter]);

  const grouped: Record<DecisionRecord["kind"], DecisionRecord[]> = {
    ADR: [],
    Convention: [],
    "Domain note": [],
  };
  filtered.forEach((r) => { grouped[r.kind].push(r); });

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Decision records</h1>
          <p className="text-sm text-[var(--text-muted)]">
            The durable record of how Acme Robotics works. Athena loads these before every task.
          </p>
        </Stack>
        <Button><Plus className="size-4" />New record</Button>
      </Cluster>

      {error && <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>}

      <Card className="p-3">
        <Cluster gap="2" align="center" className="w-full">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by id, title, or content…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-2 pl-9 pr-3 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </div>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="">All tags</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Cluster>
      </Card>

      {loading ? (
        <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FileText className="size-7" />} title="No records match" description="Adjust the search or pick a different tag." />
      ) : (
        Object.entries(grouped).map(([kind, items]) =>
          items.length === 0 ? null : (
            <Stack key={kind} gap="3">
              <Cluster gap="2" align="center">
                {(() => { const I = KIND_META[kind as DecisionRecord["kind"]].icon; return <I className={cn("size-4", KIND_META[kind as DecisionRecord["kind"]].tone)} />; })()}
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{KIND_META[kind as DecisionRecord["kind"]].label} · {items.length}</h2>
                <span className="text-xs text-[var(--text-subtle)]">{KIND_META[kind as DecisionRecord["kind"]].description}</span>
              </Cluster>
              <Card className="p-0">
                <ul className="divide-y divide-[var(--border)]">
                  {items.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => setSelected(r)}
                        className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                      >
                        <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">{r.id}</code>
                        <Stack gap="0">
                          <span className="font-medium">{r.title}</span>
                          <span className="line-clamp-1 text-xs text-[var(--text-muted)]">{r.summary}</span>
                        </Stack>
                        <Cluster gap="1" align="center" className="text-[10px] text-[var(--text-subtle)]">
                          <Tag className="size-3" />
                          {r.tag}
                        </Cluster>
                        <span className="text-[10px] text-[var(--text-subtle)]">{r.author} · {r.date}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </Stack>
          ),
        )
      )}

      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[var(--overlay)] p-4" onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <Stack gap="3">
              <Cluster justify="between" align="start">
                <Stack gap="0">
                  <Cluster gap="2" align="center">
                    <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-xs">{selected.id}</code>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", KIND_META[selected.kind].tone)}>{selected.kind}</span>
                  </Cluster>
                  <h2 className="mt-1 text-lg font-semibold">{selected.title}</h2>
                  <span className="text-xs text-[var(--text-muted)]">{selected.author} · {selected.date} · tag: {selected.tag}</span>
                </Stack>
                <button onClick={() => setSelected(null)} className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Close">✕</button>
              </Cluster>
              <p className="text-sm leading-relaxed text-[var(--text-muted)]">{selected.summary}</p>
              <Cluster gap="2" align="center" className="text-xs text-[var(--text-subtle)]">
                <span>Athena loads this record before any task touching <strong>{selected.tag}</strong>.</span>
              </Cluster>
            </Stack>
          </Card>
        </div>
      )}
    </Stack>
  );
}
