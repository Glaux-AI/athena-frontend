"use client";

/**
 * /skills/new — create a new Skill (ADR-013).
 *
 * Reuses the shared <SkillForm/> in submit-creates mode. On success
 * we navigate to the new skill's detail page.
 */

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Stack } from "@/components/layout/primitives";
import { api, ApiError, type CreateSkillIn } from "@/lib/api/client";
import { SkillForm } from "@/components/skills/skill-form";

export default function NewSkillPage() {
  const router = useRouter();

  const onSubmit = async (input: CreateSkillIn) => {
    try {
      const created = await api.skills.create(input);
      toast.success(`Skill "${created.name}" created.`);
      router.push(`/skills/${created.id}`);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Couldn't create skill.";
      toast.error(msg);
      throw e;
    }
  };

  return (
    <Stack gap="6">
      <Stack gap="1" className="border-b border-[var(--border)] pb-5">
        <Link
          href="/skills"
          className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3" />
          Skills
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">New skill</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Reusable AI competency. Defines a system prompt and (optionally) the
          phases it applies to. Attach to capabilities from the detail page
          after saving.
        </p>
      </Stack>

      <SkillForm mode="create" onSubmit={onSubmit} onCancel={() => router.push("/skills")} />
    </Stack>
  );
}
