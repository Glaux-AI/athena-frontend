"use client";

/**
 * Design tokens - manage reusable design systems. Generate one with AI or author
 * it by hand, preview it (palette + type + components), save it, and assign it to
 * domains so design tasks in those domains can pick it up.
 */

import { useCallback, useEffect, useState } from "react";
import { Palette, Plus } from "lucide-react";

import {
  ApiError,
  api,
  type DesignSystemDetail,
  type DesignSystemSummary,
  type Domain,
  type RepoFull,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { SystemEditor } from "@/components/design-tokens/system-editor";

type Mode = { kind: "list" } | { kind: "new" } | { kind: "edit"; detail: DesignSystemDetail };

export default function DesignTokensPage() {
  const [systems, setSystems] = useState<DesignSystemSummary[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [repos, setRepos] = useState<RepoFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const loadSystems = useCallback(async () => {
    const list = await api.design.listSystems();
    setSystems(list);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [, doms, reps] = await Promise.all([
          loadSystems(),
          api.domains.list().catch(() => [] as Domain[]),
          api.repos.list().catch(() => [] as RepoFull[]),
        ]);
        if (!cancelled) {
          setDomains(doms);
          setRepos(reps);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load design systems.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSystems]);

  const open = async (id: string) => {
    try {
      const detail = await api.design.getSystem(id);
      setMode({ kind: "edit", detail });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't open that design system.");
    }
  };

  const onSaved = async (saved: DesignSystemDetail) => {
    await loadSystems();
    setMode({ kind: "edit", detail: saved });
  };

  const onDeleted = async () => {
    await loadSystems();
    setMode({ kind: "list" });
  };

  return (
    <Stack gap="5" className="mx-auto w-full max-w-6xl px-4 py-6">
      <Cluster justify="between" align="center" className="flex-wrap gap-3">
        <Cluster gap="2.5" align="center">
          <Palette className="size-5 text-[var(--primary)]" aria-hidden />
          <Stack gap="0">
            <h1 className="text-lg font-semibold text-[var(--text)]">Design tokens</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Reusable design systems, generated with AI or authored by hand, assignable to domains.
            </p>
          </Stack>
        </Cluster>
        <Button onClick={() => setMode({ kind: "new" })}>
          <Plus className="size-4" />
          New design system
        </Button>
      </Cluster>

      {error && (
        <Card variant="elevated" className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        <div className="min-w-0">
          {loading ? (
            <Stack gap="2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-[var(--surface-2)]" />
              ))}
            </Stack>
          ) : systems.length === 0 ? (
            <EmptyState
              icon={<Palette className="size-5" />}
              title="No design systems yet"
              description="Generate one with AI or create it by hand to get started."
            />
          ) : (
            <Stack gap="2" as="ul">
              {systems.map((s) => {
                const active = mode.kind === "edit" && mode.detail.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void open(s.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                      )}
                    >
                      <Cluster justify="between" align="center" gap="2">
                        <span className="truncate text-sm font-medium text-[var(--text)]">{s.name}</span>
                        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
                          {s.origin}
                        </span>
                      </Cluster>
                      {s.description && (
                        <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">{s.description}</p>
                      )}
                      <p className="mt-1 text-[11px] text-[var(--text-subtle)]">
                        {s.domain_ids.length} domain{s.domain_ids.length === 1 ? "" : "s"}
                        {" · "}
                        {s.component_count} component{s.component_count === 1 ? "" : "s"}
                      </p>
                    </button>
                  </li>
                );
              })}
            </Stack>
          )}
        </div>

        <div className="min-w-0">
          {mode.kind === "list" ? (
            <Card variant="elevated">
              <EmptyState
                icon={<Palette className="size-5" />}
                title="Select or create a design system"
                description="Pick one on the left to edit, or create a new one. Use AI to generate a full system from a prompt, then refine the preview or the code."
              />
            </Card>
          ) : (
            <SystemEditor
              detail={mode.kind === "edit" ? mode.detail : null}
              domains={domains}
              repos={repos}
              onSaved={onSaved}
              onDeleted={onDeleted}
            />
          )}
        </div>
      </div>
    </Stack>
  );
}
