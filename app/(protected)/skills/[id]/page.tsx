"use client";

/**
 * /skills/[id] — full skill detail.
 *
 * Overview · system prompt · knowledge refs · capability attachment toggles ·
 * phase scoping · usage stats.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Edit3, Layers, Sparkles, Zap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { api, ApiError, type SkillDetail, type Capability } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const PHASES_IMPL = ["spec", "plan", "implement", "review", "ci", "pr"] as const;
const PHASES_PRD  = ["frame", "research", "draft", "signoff"] as const;
const ALL_PHASES  = [...PHASES_IMPL, ...PHASES_PRD];

export default function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([api.skills.get(id), api.capabilities.list()]);
        setSkill(s);
        setCapabilities(c);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load skill");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
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
  if (error || !skill) return <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error ?? "Skill not found"}</p></Card>;

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Link href="/skills" className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft className="size-3" />
          Skills
        </Link>
        <Cluster gap="3" align="center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <Zap className="size-5" />
          </div>
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <h1 className="text-2xl font-semibold tracking-tight">{skill.name}</h1>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                skill.status === "active" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]",
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
        <KpiBlock label="Author"              value={skill.author ?? "—"} />
        <KpiBlock label="Last updated"        value={skill.last_updated ?? "—"} />
      </Grid>

      <Card>
        <Stack gap="3">
          <Cluster justify="between" align="center">
            <Cluster gap="2" align="center">
              <Sparkles className="size-4 text-[var(--text-muted)]" />
              <span className="text-sm font-semibold">System prompt</span>
            </Cluster>
            <Button variant="outline" size="sm"><Edit3 className="size-3.5" />Edit</Button>
          </Cluster>
          <pre className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-[12px] leading-relaxed text-[var(--text)] whitespace-pre-wrap">
            {skill.system_prompt ?? "(no system prompt configured)"}
          </pre>
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <BookOpen className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">Knowledge references</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">{skill.knowledge_refs?.length ?? 0}</span>
          </Cluster>
          {skill.knowledge_refs && skill.knowledge_refs.length > 0 ? (
            <Stack gap="2" as="ul">
              {skill.knowledge_refs.map((k) => (
                <li key={k.id} className="rounded-md border border-[var(--border)] p-2 text-sm">
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
            <p className="text-sm text-[var(--text-muted)]">No specific knowledge references attached. The skill uses general capability knowledge.</p>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack gap="3">
          <Cluster gap="2" align="center">
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
          <Cluster gap="2" align="center">
            <Layers className="size-4 text-[var(--text-muted)]" />
            <span className="text-sm font-semibold">Attached to capabilities</span>
            <span className="ml-auto text-xs text-[var(--text-muted)]">{skill.attached_capabilities.length} of {capabilities.length}</span>
          </Cluster>
          <Grid cols="auto-fit-220" gap="2">
            {capabilities.map((c) => {
              const on = skill.attached_capabilities.includes(c.id);
              return (
                <label
                  key={c.id}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-md border p-2 text-sm",
                    on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-2)]",
                  )}
                >
                  <Stack gap="0">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-[10px] text-[var(--text-subtle)]">/{c.slug}</span>
                  </Stack>
                  <input
                    type="checkbox"
                    defaultChecked={on}
                    className="size-4 rounded border-[var(--border-strong)]"
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
