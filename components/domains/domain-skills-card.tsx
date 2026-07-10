"use client";

/**
 * <DomainSkillsCard/> - the domain Config tab's attached-skills surface.
 *
 * Renders the skills attached to this domain (name chips linking to the skill,
 * each with a detach control) and, for users who can manage domain settings, a
 * "+ Attach skill" picker of the org's not-yet-attached skills. Attach/detach
 * call the shared ``/v1/skills/{id}/attach/{domain}`` endpoints (BE requires
 * ``settings:manage`` on the domain); a 403 is surfaced as a toast. The canonical
 * per-skill attach view still lives on the skill detail page - both call the
 * same endpoints, so they never diverge.
 */

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type DomainSkillRef, type Skill } from "@/lib/api/client";

export function DomainSkillsCard({
  domainId,
  skills,
  canManage,
  onChange,
}: {
  domainId: string;
  skills: DomainSkillRef[];
  canManage: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [orgSkills, setOrgSkills] = useState<Skill[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const attachedIds = new Set(skills.map((s) => s.id));
  const candidates = (orgSkills ?? []).filter(
    (s) => !attachedIds.has(s.id) && s.status !== "archived",
  );

  const openPicker = async () => {
    setAdding(true);
    if (orgSkills === null) {
      try {
        setOrgSkills(await api.skills.list());
      } catch {
        setOrgSkills([]);
        toast.error("Couldn't load skills.");
      }
    }
  };

  const run = async (
    skillId: string,
    op: (id: string, domain: string) => Promise<unknown>,
    after?: () => void,
  ) => {
    setBusy(skillId);
    try {
      await op(skillId, domainId);
      onChange();
      after?.();
    } catch (e) {
      toast.error(
        e instanceof ApiError ? e.message : "Couldn't update the attachment.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <Stack gap="3">
        <Cluster
          justify="between"
          align="center"
          className="pb-2"
        >
          <span className="text-sm font-semibold">
            Skills attached ({skills.length})
          </span>
          {canManage && !adding && (
            <Button
              variant="outline"
              size="sm"
              onClick={openPicker}
              data-testid="domain-attach-skill"
            >
              <Plus className="size-3.5" />
              Attach skill
            </Button>
          )}
        </Cluster>
        <hr className="hr-horizon" aria-hidden="true" />

        {skills.length === 0 && !adding && (
          <p className="text-sm text-[var(--text-muted)]">
            No skills attached. Attach a competency to govern this domain&apos;s
            AI work.
          </p>
        )}

        {skills.length > 0 && (
          <Cluster gap="2">
            {skills.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] py-0.5 pl-2 pr-1 text-xs font-medium text-[var(--primary-ink)]"
              >
                <Link href={`/skills/${s.id}`} className="hover:underline">
                  {s.name}
                </Link>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => run(s.id, api.skills.detachDomain)}
                    disabled={busy === s.id}
                    aria-label={`Detach ${s.name}`}
                    className="rounded-full p-0.5 transition-colors hover:bg-[var(--primary-soft)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
          </Cluster>
        )}

        {adding && (
          <Stack gap="2" className="rounded-md border border-[var(--border)] p-2">
            {orgSkills === null ? (
              <p className="text-xs text-[var(--text-muted)]">Loading skills…</p>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                No more skills to attach.{" "}
                <Link href="/skills/new" className="underline">
                  Create one
                </Link>
                .
              </p>
            ) : (
              candidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy === s.id}
                  onClick={() =>
                    run(s.id, api.skills.attachDomain, () => setAdding(false))
                  }
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-[var(--surface-2)] disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-xs text-[var(--text-subtle)]">
                      {s.slug}
                    </span>
                  </span>
                  <Plus className="size-3.5 shrink-0 text-[var(--text-muted)]" />
                </button>
              ))
            )}
            <Cluster justify="end">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                Done
              </Button>
            </Cluster>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
