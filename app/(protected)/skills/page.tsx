"use client";

/**
 * /skills - reusable AI competencies. Each skill is scoped to one or more
 * phases and attaches to domains.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { SkillImportModal } from "@/components/skills/skill-import-modal";
import { api, ApiError, type Skill } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export default function SkillsPage() {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Belt-and-suspenders: the BE already excludes archived (soft-deleted)
        // skills; the filter also guards mock mode.
        setSkills((await api.skills.list()).filter((s) => s.status !== "archived"));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load skills");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-5">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-[var(--text-muted)]">Reusable AI competencies. Attach to domains, scope to phases.</p>
        </Stack>
        <Cluster gap="2" align="center">
          <Button variant="outline" onClick={() => setImporting(true)} data-testid="skills-import-button">
            <Upload className="size-4" />Import
          </Button>
          <Button onClick={() => router.push("/skills/new")} data-testid="skills-new-button">
            <Plus className="size-4" />New skill
          </Button>
        </Cluster>
      </Cluster>

      <SkillImportModal open={importing} onClose={() => setImporting(false)} />

      {error && <Card className="border-[var(--danger)] bg-[var(--danger-soft)] shadow-[var(--shadow-1)]"><p className="text-sm text-[var(--danger-ink)]">{error}</p></Card>}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading skills">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <Stack gap="3">
                <Cluster justify="between" align="start">
                  <Stack gap="1">
                    <div className="h-4 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
                    <div className="h-3 w-28 animate-pulse rounded-md bg-[var(--surface-2)]" />
                  </Stack>
                  <div className="h-4 w-14 animate-pulse rounded-full bg-[var(--surface-2)]" />
                </Cluster>
                <Stack gap="1">
                  <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
                  <div className="h-3 w-5/6 animate-pulse rounded-md bg-[var(--surface-2)]" />
                </Stack>
                <Cluster gap="1">
                  <div className="h-4 w-14 animate-pulse rounded-full bg-[var(--surface-2)]" />
                  <div className="h-4 w-16 animate-pulse rounded-full bg-[var(--surface-2)]" />
                </Cluster>
                <div className="h-3 w-2/3 animate-pulse rounded-md bg-[var(--surface-2)]" />
              </Stack>
            </Card>
          ))}
        </Grid>
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {skills.map((s) => (
            <Link key={s.id} href={`/skills/${s.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-lg">
            <Card className="h-full transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-2)]">
              <Stack gap="3">
                <Cluster justify="between" align="start">
                  <Stack gap="0">
                    <h3 className="text-base font-semibold leading-tight">{s.name}</h3>
                    <span className="text-xs text-[var(--text-muted)]">{s.slug} · {s.version}</span>
                  </Stack>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", s.status === "active" ? "bg-[var(--success-soft)] text-[var(--success-ink)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>
                    {s.status}
                  </span>
                </Cluster>
                <Tooltip content={s.description} className="max-w-xs text-xs">
                  <p className="line-clamp-3 text-sm text-[var(--text-muted)]">{s.description}</p>
                </Tooltip>
                <Cluster gap="1" align="center">
                  {s.phases.map((p) => (
                    <span key={p} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
                      {p}
                    </span>
                  ))}
                </Cluster>
                <Cluster gap="3" align="center" className="text-xs text-[var(--text-muted)]">
                  <span><strong className="text-[var(--text)]">{s.attached_domains.length}</strong> domains</span>
                  <span>·</span>
                  <span><strong className="text-[var(--text)]">{s.usage_count}</strong> uses</span>
                  <span>·</span>
                  <span>last {s.last_used}</span>
                </Cluster>
              </Stack>
            </Card>
            </Link>
          ))}
        </Grid>
      )}
    </Stack>
  );
}
