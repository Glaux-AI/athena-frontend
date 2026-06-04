"use client";

/**
 * /skills/[id]/edit — edit an existing Skill (ADR-013).
 *
 * Reuses the shared <SkillForm/> in edit mode. Pre-fetches the skill
 * detail so the form mounts pre-filled. Slug is locked in edit mode
 * (the BE treats it as immutable post-create).
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Stack } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type SkillDetail,
  type UpdateSkillIn,
} from "@/lib/api/client";
import { SkillForm } from "@/components/skills/skill-form";

export default function EditSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setSkill(await api.skills.get(id));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load skill");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onSubmit = async (input: UpdateSkillIn) => {
    try {
      await api.skills.update(id, input);
      toast.success("Skill updated.");
      router.push(`/skills/${id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't save skill.";
      toast.error(msg);
      throw e;
    }
  };

  if (loading) {
    return (
      <Stack gap="6" aria-busy="true" aria-label="Loading skill">
        <Stack gap="1">
          <div className="h-3 w-16 animate-pulse rounded-md bg-[var(--surface-2)]" />
          <div className="h-7 w-56 animate-pulse rounded-md bg-[var(--surface-2)]" />
        </Stack>
        <div className="h-64 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-48 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  if (error || !skill) {
    return (
      <Card className="border-[var(--danger)] bg-[var(--danger-soft)] shadow-[var(--shadow-1)]">
        <p className="text-sm text-[var(--danger-ink)]">{error ?? "Skill not found"}</p>
      </Card>
    );
  }

  return (
    <Stack gap="6">
      <Stack gap="1" className="border-b border-[var(--border)] pb-5">
        <Link
          href={`/skills/${id}`}
          className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3" />
          Back to {skill.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Edit skill</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Slug is immutable. Change the prompt, phase scope, or status. Attach
          to capabilities from the detail page.
        </p>
      </Stack>

      <SkillForm
        mode="edit"
        initial={skill}
        onSubmit={onSubmit}
        onCancel={() => router.push(`/skills/${id}`)}
      />
    </Stack>
  );
}
