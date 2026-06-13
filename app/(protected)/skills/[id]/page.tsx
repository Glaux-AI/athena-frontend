"use client";

/**
 * /skills/[id] - full skill detail.
 *
 * Overview · system prompt · knowledge refs · domain attachment toggles ·
 * phase scoping · usage stats.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Edit3, Layers, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { api, ApiError, type SkillDetail, type Domain } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const PHASES_IMPL = ["spec", "plan", "implement", "review", "ci", "pr"] as const;
const PHASES_PRD  = ["frame", "research", "draft", "signoff"] as const;
const ALL_PHASES  = [...PHASES_IMPL, ...PHASES_PRD];

export default function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttach, setPendingAttach] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([api.skills.get(id), api.domains.list()]);
        setSkill(s);
        setDomains(c);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load skill");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const toggleDomain = async (capId: string, attach: boolean) => {
    if (!skill) return;
    setPendingAttach((s) => new Set(s).add(capId));
    const prev = skill.attached_domains;
    // Optimistic - flip immediately, roll back on error.
    setSkill({
      ...skill,
      attached_domains: attach
        ? [...new Set([...prev, capId])]
        : prev.filter((x) => x !== capId),
    });
    try {
      if (attach) await api.skills.attachDomain(id, capId);
      else await api.skills.detachDomain(id, capId);
    } catch (e) {
      // Roll back.
      setSkill((s) => (s ? { ...s, attached_domains: prev } : s));
      toast.error(e instanceof ApiError ? e.message : "Couldn't update attachment.");
    } finally {
      setPendingAttach((s) => {
        const next = new Set(s);
        next.delete(capId);
        return next;
      });
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (error || !skill) return <Card className="border-[var(--danger)] bg-[var(--danger-soft)] shadow-[var(--shadow-1)]"><p className="text-sm text-[var(--danger-ink)]">{error ?? "Skill not found"}</p></Card>;

  return (
    <Stack gap="6">
      <Stack gap="2" className="border-b border-[var(--border)] pb-5">
        <Link href="/skills" className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]">
          <ArrowLeft className="size-3" />
          Skills
        </Link>
        <Cluster gap="3" align="center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--inner-highlight)]">
            <Zap className="size-5" />
          </div>
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <h1 className="text-2xl font-semibold tracking-tight">{skill.name}</h1>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                skill.status === "active" ? "bg-[var(--success-soft)] text-[var(--success-ink)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]",
              )}>{skill.status}</span>
              <span className="text-xs text-[var(--text-muted)]">{skill.slug} · {skill.version}</span>
            </Cluster>
            <span className="text-sm text-[var(--text-muted)]">{skill.description}</span>
          </Stack>
        </Cluster>
      </Stack>

      <Grid cols="auto-fit-160" gap="3">
        <KpiBlock label="Uses (lifetime)"     value={skill.usage_count.toString()} />
        <KpiBlock label="Last used"           value={skill.last_used} />
        <KpiBlock label="Author"              value={skill.author ?? "-"} />
        <KpiBlock label="Last updated"        value={skill.last_updated ?? "-"} />
      </Grid>

      <Card variant="elevated" className="overflow-hidden p-0">
        <Cluster
          justify="between"
          align="center"
          gap="3"
          className="border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-[var(--surface)] px-4 py-2.5 shadow-[var(--inner-highlight)]"
        >
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">System prompt</span>
          </Cluster>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/skills/${id}/edit`)}
            data-testid="skill-edit-button"
          >
            <Edit3 className="size-3.5" />Edit
          </Button>
        </Cluster>
        <div className="p-4">
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)] shadow-[var(--inner-highlight)]">
            {skill.system_prompt ?? "(no system prompt configured)"}
          </pre>
        </div>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
            <BookOpen className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">Knowledge references</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">{skill.knowledge_refs?.length ?? 0}</span>
          </Cluster>
          {skill.knowledge_refs && skill.knowledge_refs.length > 0 ? (
            <Stack gap="2" as="ul">
              {skill.knowledge_refs.map((k) => (
                <li key={k.id} className="rounded-md border border-[var(--border)] p-2 text-sm transition-colors hover:bg-[var(--surface-2)]">
                  <Cluster justify="between" align="center">
                    <Cluster gap="2" align="center">
                      <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px]">{k.id}</code>
                      <span className="font-medium">{k.title}</span>
                    </Cluster>
                    <span className="text-xs text-[var(--text-muted)]">{k.kind}</span>
                  </Cluster>
                </li>
              ))}
            </Stack>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No specific knowledge references attached. The skill uses general domain knowledge.</p>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
            <span className="text-sm font-semibold">Phase scope</span>
            <span className="text-xs text-[var(--text-muted)]">When Athena loads this skill</span>
          </Cluster>
          <Grid cols="auto-fit-110" gap="2">
            {ALL_PHASES.map((p) => {
              const on = skill.phases.includes(p);
              return (
                <div
                  key={p}
                  className={cn(
                    "rounded-md border px-2 py-1 text-center text-xs font-medium capitalize",
                    on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                       : "border-[var(--border)] text-[var(--text-subtle)]",
                  )}
                >
                  {p}
                </div>
              );
            })}
          </Grid>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center" className="border-b border-[var(--border)] pb-2">
            <Layers className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">Attached to domains</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">{skill.attached_domains.length} of {domains.length}</span>
          </Cluster>
          <Grid cols="auto-fit-220" gap="2">
            {domains.map((c) => {
              const on = skill.attached_domains.includes(c.id);
              const busy = pendingAttach.has(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 text-sm transition-[background-color,border-color] duration-150 ease-out",
                    on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
                    busy && "opacity-60",
                  )}
                >
                  <Stack gap="0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[10px] text-[var(--text-subtle)]">/{c.slug}</span>
                  </Stack>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={busy}
                    onChange={(e) => toggleDomain(c.id, e.target.checked)}
                    className="size-4 rounded border-[var(--border-strong)]"
                    data-testid={`skill-attach-${c.id}`}
                  />
                </label>
              );
            })}
          </Grid>
        </Stack>
      </Card>
    </Stack>
  );
}

function KpiBlock({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <Stack gap="0">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{label}</span>
        <span className="text-base font-semibold tabular-nums">{value}</span>
      </Stack>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading skill">
      <Stack gap="1">
        <div className="h-3 w-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <Cluster gap="3" align="center">
          <div className="size-10 animate-pulse rounded-lg bg-[var(--surface-2)]" />
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <div className="h-7 w-56 animate-pulse rounded-md bg-[var(--surface-2)]" />
              <div className="h-4 w-14 animate-pulse rounded-full bg-[var(--surface-2)]" />
              <div className="h-3 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
            </Cluster>
            <div className="h-4 w-80 animate-pulse rounded-md bg-[var(--surface-2)]" />
          </Stack>
        </Cluster>
      </Stack>
      <Grid cols="auto-fit-160" gap="3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        ))}
      </Grid>
      <div className="h-48 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-32 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-28 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      <div className="h-40 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
    </Stack>
  );
}
