"use client";

/**
 * /skills — reusable AI competencies. Each skill is scoped to one or more
 * phases and attaches to capabilities.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { api, ApiError, type Skill } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setSkills(await api.skills.list()); }
      catch (e) { setError(e instanceof ApiError ? e.message : "Failed to load skills"); }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <Stack gap="6">
      <Cluster justify="between" align="center">
        <Stack gap="1">
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-sm text-[var(--text-muted)]">Reusable AI competencies. Attach to capabilities, scope to phases.</p>
        </Stack>
        <Button><Plus className="size-4" />New skill</Button>
      </Cluster>

      {error && <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]"><p className="text-sm text-[var(--danger)]">{error}</p></Card>}

      {loading ? (
        <Cluster gap="2" align="center"><Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /><span className="text-sm text-[var(--text-muted)]">Loading…</span></Cluster>
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {skills.map((s) => (
            <Link key={s.id} href={`/skills/${s.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-lg">
            <Card className="hover:bg-[var(--surface-2)]">
              <Stack gap="3">
                <Cluster justify="between" align="start">
                  <Stack gap="0">
                    <h3 className="text-base font-semibold leading-tight">{s.name}</h3>
                    <span className="text-xs text-[var(--text-muted)]">{s.slug} · {s.version}</span>
                  </Stack>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", s.status === "active" ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--surface-2)] text-[var(--text-muted)]")}>
                    {s.status}
                  </span>
                </Cluster>
                <p className="line-clamp-3 text-sm text-[var(--text-muted)]">{s.description}</p>
                <Cluster gap="1" align="center">
                  {s.phases.map((p) => (
                    <span key={p} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary)]">
                      {p}
                    </span>
                  ))}
                </Cluster>
                <Cluster gap="3" align="center" className="text-xs text-[var(--text-muted)]">
                  <span><strong className="text-[var(--text)]">{s.attached_capabilities.length}</strong> capabilities</span>
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
