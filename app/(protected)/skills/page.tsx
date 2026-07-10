"use client";

/**
 * /skills - reusable AI competencies. Each skill is scoped to one or more
 * phases and attaches to domains.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Upload } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Tooltip } from "@/components/ui/tooltip";
import { SkillImportModal } from "@/components/skills/skill-import-modal";
import { api, ApiError, type Skill } from "@/lib/api/client";

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
      <Stack gap="5">
        <Cluster justify="between" align="center">
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
        <hr className="hr-horizon" aria-hidden />
      </Stack>

      <SkillImportModal open={importing} onClose={() => setImporting(false)} />

      {error && <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">{error}</div>}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading skills">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <Stack gap="3">
                <Cluster justify="between" align="start">
                  <Stack gap="1">
                    <Skeleton className="h-4 w-40 rounded-md" />
                    <Skeleton className="h-3 w-28 rounded-md" />
                  </Stack>
                  <Skeleton className="h-4 w-14 rounded-full" />
                </Cluster>
                <Stack gap="1">
                  <Skeleton className="h-3 w-full rounded-md" />
                  <Skeleton className="h-3 w-5/6 rounded-md" />
                </Stack>
                <Cluster gap="1">
                  <Skeleton className="h-4 w-14 rounded-full" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </Cluster>
                <Skeleton className="h-3 w-2/3 rounded-md" />
              </Stack>
            </Card>
          ))}
        </Grid>
      ) : !error && skills.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No skills yet"
          description="Skills are reusable AI competencies your agents can invoke. Create one from scratch, or import a skill bundle."
          action={
            <Cluster gap="2" align="center">
              <Button variant="outline" onClick={() => setImporting(true)}>
                <Upload className="size-4" />Import
              </Button>
              <Button onClick={() => router.push("/skills/new")}>
                <Plus className="size-4" />New skill
              </Button>
            </Cluster>
          }
        />
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {skills.map((s) => (
            <Link key={s.id} href={`/skills/${s.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-xl">
            <Card variant="moment" interactive className="h-full">
              <Stack gap="3">
                <Cluster justify="between" align="start">
                  <Stack gap="0">
                    <h3 className="text-base font-semibold leading-tight">{s.name}</h3>
                    <span className="text-xs text-[var(--text-muted)]">{s.slug} · {s.version}</span>
                  </Stack>
                  <Pill
                    size="sm"
                    tone={s.status === "active" ? "success" : "neutral"}
                    dot
                    live={s.status === "active"}
                    className="capitalize"
                  >
                    {s.status}
                  </Pill>
                </Cluster>
                <Tooltip content={s.description} className="max-w-xs text-xs">
                  <p className="line-clamp-3 text-sm text-[var(--text-muted)]">{s.description}</p>
                </Tooltip>
                <Cluster gap="1" align="center">
                  {s.phases.map((p) => (
                    <Pill key={p} size="sm" tone="primary">
                      {p}
                    </Pill>
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
