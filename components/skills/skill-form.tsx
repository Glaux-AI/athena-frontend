"use client";

/**
 * <SkillForm/> — shared form for /skills/new + /skills/[id]/edit.
 *
 * Pure-presentation: parent owns the network call. Validates the
 * inputs the BE will reject (slug regex, system_prompt non-empty,
 * status enum) before bubbling to keep the round-trip cost low. Slug
 * is locked in edit-mode since the BE treats slug as immutable
 * post-create.
 */

import { useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import type {
  CreateSkillIn,
  SkillDetail,
  SkillKnowledgeRef,
  UpdateSkillIn,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

const PHASES_IMPL = ["spec", "plan", "implement", "review", "ci", "pr"] as const;
const PHASES_PRD = ["frame", "research", "draft", "signoff"] as const;
const ALL_PHASES = [...PHASES_IMPL, ...PHASES_PRD] as const;

const STATUS_OPTIONS = ["draft", "active", "archived"] as const;
type Status = (typeof STATUS_OPTIONS)[number];

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;

interface FormState {
  name: string;
  slug: string;
  description: string;
  system_prompt: string;
  status: Status;
  version: string;
  phases: string[];
  knowledge_refs: SkillKnowledgeRef[];
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  description: "",
  system_prompt: "",
  status: "draft",
  version: "0.1.0",
  phases: [],
  knowledge_refs: [],
};

type Mode = "create" | "edit";

interface Props {
  mode: Mode;
  initial?: SkillDetail | null;
  onSubmit: (input: CreateSkillIn & UpdateSkillIn) => Promise<void>;
  onCancel: () => void;
}

export function SkillForm({ mode, initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(() => fromSkill(initial));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initial) setForm(fromSkill(initial));
  }, [initial]);

  const slugError = useMemo<string | null>(() => {
    if (mode === "edit") return null; // slug locked
    if (!form.slug) return null;
    if (!SLUG_PATTERN.test(form.slug)) {
      return "Slug must be lowercase letters, digits, and hyphens (no leading/trailing hyphen).";
    }
    return null;
  }, [form.slug, mode]);

  // Auto-derive slug from name in create mode (only while user hasn't
  // explicitly customised it).
  const onNameChange = (v: string) => {
    setForm((f) => {
      const derived = slugify(v);
      const shouldDerive =
        mode === "create" && (f.slug === "" || f.slug === slugify(f.name));
      return { ...f, name: v, ...(shouldDerive ? { slug: derived } : {}) };
    });
  };

  const togglePhase = (phase: string) => {
    setForm((f) => {
      const on = f.phases.includes(phase);
      return {
        ...f,
        phases: on ? f.phases.filter((p) => p !== phase) : [...f.phases, phase],
      };
    });
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    if (mode === "create") {
      if (!form.slug.trim()) return "Slug is required.";
      if (!SLUG_PATTERN.test(form.slug)) {
        return "Slug must be lowercase letters, digits, and hyphens (no leading/trailing hyphen).";
      }
    }
    if (!form.system_prompt.trim()) return "System prompt is required.";
    if (!STATUS_OPTIONS.includes(form.status)) return "Invalid status.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload: CreateSkillIn & UpdateSkillIn = {
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || null,
        system_prompt: form.system_prompt,
        status: form.status,
        version: form.version.trim() || "0.1.0",
        phases: form.phases,
        knowledge_refs: form.knowledge_refs,
      };
      await onSubmit(payload);
    } catch {
      // Parent surfaces toast; keep the form mounted so the user can retry.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-label={mode === "create" ? "Create skill" : "Edit skill"}>
      <Stack gap="4">
        <Card>
          <Stack gap="4">
            <FieldRow label="Name" required>
              <input
                type="text"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="e.g. Security review"
                className="input"
                data-testid="skill-form-name"
              />
            </FieldRow>

            <FieldRow label="Slug" required helper="Used in URLs and the invoke_skill tool. Lowercase + digits + hyphens.">
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                placeholder="security-review"
                className="input font-mono"
                disabled={mode === "edit"}
                aria-invalid={!!slugError}
                data-testid="skill-form-slug"
              />
              {slugError && <p className="mt-1 text-xs text-[var(--danger)]">{slugError}</p>}
            </FieldRow>

            <FieldRow label="Description" helper="One-line summary surfaced on the Skills list.">
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this skill is for."
                className="input"
                data-testid="skill-form-description"
              />
            </FieldRow>

            <Cluster gap="3">
              <FieldRow label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
                  className="input capitalize"
                  data-testid="skill-form-status"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </FieldRow>
              <FieldRow label="Version">
                <input
                  type="text"
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="0.1.0"
                  className="input font-mono"
                  data-testid="skill-form-version"
                />
              </FieldRow>
            </Cluster>
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Stack gap="0">
              <span className="text-sm font-semibold">System prompt</span>
              <span className="text-xs text-[var(--text-muted)]">The instructions Athena applies when this skill is invoked.</span>
            </Stack>
            <textarea
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder="You are a security reviewer. For every diff…"
              className="input min-h-[200px] font-mono text-xs leading-relaxed"
              data-testid="skill-form-system-prompt"
            />
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Stack gap="0">
              <span className="text-sm font-semibold">Phase scope</span>
              <span className="text-xs text-[var(--text-muted)]">When Athena loads this skill (no selection = available everywhere).</span>
            </Stack>
            <Grid cols="auto-fit-110" gap="2">
              {ALL_PHASES.map((p) => {
                const on = form.phases.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePhase(p)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-center text-xs font-medium capitalize transition-colors",
                      on
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border)] text-[var(--text-subtle)] hover:bg-[var(--surface-2)]"
                    )}
                    aria-pressed={on}
                    data-testid={`skill-form-phase-${p}`}
                  >
                    {p}
                  </button>
                );
              })}
            </Grid>
          </Stack>
        </Card>

        {error && (
          <Card className="border-[var(--danger)] bg-[var(--danger-soft)]">
            <p className="text-sm text-[var(--danger-ink)]" data-testid="skill-form-error">{error}</p>
          </Card>
        )}

        <Cluster justify="end" gap="2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting} data-testid="skill-form-submit">
            {submitting ? "Saving…" : mode === "create" ? "Create skill" : "Save changes"}
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

function FieldRow({
  label, required, helper, children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
        {label}
        {required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      {children}
      {helper && <span className="mt-1 block text-[10.5px] text-[var(--text-subtle)]">{helper}</span>}
    </label>
  );
}

function fromSkill(d: SkillDetail | null | undefined): FormState {
  if (!d) return EMPTY_FORM;
  const status: Status = STATUS_OPTIONS.includes(d.status as Status)
    ? (d.status as Status)
    : "draft";
  return {
    name: d.name,
    slug: d.slug,
    description: d.description ?? "",
    system_prompt: d.system_prompt ?? "",
    status,
    version: d.version,
    phases: [...(d.phases ?? [])],
    knowledge_refs: [...(d.knowledge_refs ?? [])],
  };
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
