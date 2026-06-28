"use client";

/**
 * Editor for a design system's COMPONENTS (button, card, input, ...). Each is a
 * named block of token-based CSS plus a small HTML markup sample; users add, edit
 * (name / description / css / markup), and remove them. The parent owns the array
 * and persists it with the system (the backend replaces components wholesale on
 * save); this is pure presentation over that array.
 */

import { useState } from "react";
import { Boxes, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

export interface ComponentDraft {
  /** Present for a component loaded from a saved system; absent for a new draft. */
  id?: string;
  name: string;
  description: string;
  css: string;
  markup: string;
}

const FIELD =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function ComponentsEditor({
  components,
  onChange,
}: {
  components: ComponentDraft[];
  onChange: (next: ComponentDraft[]) => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<ComponentDraft>) =>
    onChange(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => {
    onChange(components.filter((_, j) => j !== i));
    setOpenIndex(null);
  };
  const add = () => {
    onChange([...components, { name: "New component", description: "", css: "", markup: "" }]);
    setOpenIndex(components.length);
  };

  return (
    <Stack gap="2">
      <Cluster justify="between" align="center">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <Boxes className="size-3.5 text-[var(--primary)]" aria-hidden />
          Components
          <span className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] tabular-nums text-[var(--text-subtle)]">
            {components.length}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={add}>
          <Plus className="size-3.5" />
          Add component
        </Button>
      </Cluster>

      {components.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-center text-xs text-[var(--text-muted)]">
          No components yet. Generate a system with AI to get a detailed set, or add
          one by hand.
        </p>
      ) : (
        <Stack gap="1.5" as="ul">
          {components.map((c, i) => (
            <ComponentRow
              key={c.id ?? `draft-${i}`}
              component={c}
              open={openIndex === i}
              onToggle={() => setOpenIndex((p) => (p === i ? null : i))}
              onChange={(patch) => update(i, patch)}
              onRemove={() => remove(i)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ComponentRow({
  component,
  open,
  onToggle,
  onChange,
  onRemove,
}: {
  component: ComponentDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ComponentDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <Cluster justify="between" align="center" className="px-2.5 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex min-w-0 items-center gap-1.5 text-left text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          )}
          <span className="truncate">{component.name || "Untitled component"}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${component.name || "component"}`}
          className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Trash2 className="size-3.5" />
        </button>
      </Cluster>

      {open && (
        <Stack gap="2" className="border-t border-[var(--border)] bg-[var(--surface-2)] p-2.5">
          <input
            value={component.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Component name"
            aria-label="Component name"
            className={cn(FIELD, "text-sm font-medium")}
          />
          <input
            value={component.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What this component is (optional)"
            aria-label="Component description"
            className={cn(FIELD, "text-xs text-[var(--text-muted)]")}
          />
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
            CSS (uses var(--token))
          </label>
          <textarea
            value={component.css}
            onChange={(e) => onChange({ css: e.target.value })}
            aria-label="Component CSS"
            spellCheck={false}
            className={cn(FIELD, "h-28 resize-y font-mono text-xs leading-relaxed")}
          />
          <label className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
            Markup (HTML sample)
          </label>
          <textarea
            value={component.markup}
            onChange={(e) => onChange({ markup: e.target.value })}
            aria-label="Component markup"
            spellCheck={false}
            className={cn(FIELD, "h-20 resize-y font-mono text-xs leading-relaxed")}
          />
        </Stack>
      )}
    </li>
  );
}
