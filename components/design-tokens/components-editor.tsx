"use client";

/**
 * Editor for a design system's COMPONENTS (button, card, input, ...). Each is a
 * named block of token-based CSS plus a small HTML markup sample; users add,
 * edit (name / description / css / markup), reorder (array order persists as
 * sort_order), duplicate, remove, and import candidates straight from the org's
 * repos. Rows expand independently and each expanded row shows a live, inert
 * mini preview built from the SYSTEM css + the component's own css. The parent
 * owns the array and persists it with the system (the backend replaces
 * components wholesale on save); this is pure presentation over that array.
 */

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronDown,
  ChevronRight,
  Copy,
  Import,
  Plus,
  Trash2,
} from "lucide-react";

import type { DesignSystemComponentInput, RepoFull } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { buildComponentPreviewHtml } from "@/lib/design/showcase";
import { cn } from "@/lib/cn";

import { ImportComponentsDialog } from "./import-components-dialog";
import { useDebouncedValue } from "./showcase-preview";

export interface ComponentDraft {
  /** Stable client-side key (crypto.randomUUID()) - NOT the array index, so
   *  reorder / delete never re-targets another row's expand state or inputs. */
  key: string;
  /** Present for a component loaded from a saved system; absent for a new draft. */
  id?: string;
  name: string;
  description: string;
  css: string;
  markup: string;
}

/** Lift wire-shape components (AI result / import) into keyed drafts. */
export function draftsFromInputs(components: DesignSystemComponentInput[]): ComponentDraft[] {
  return components.map((c) => ({
    key: crypto.randomUUID(),
    name: c.name,
    description: c.description ?? "",
    css: c.css ?? "",
    markup: c.markup ?? "",
  }));
}

const FIELD =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

export function ComponentsEditor({
  components,
  onChange,
  css,
  repos,
}: {
  components: ComponentDraft[];
  onChange: (next: ComponentDraft[]) => void;
  /** The system's canonical css - resolves var(--token) in the mini previews
   *  and grounds the repo import. */
  css: string;
  repos: RepoFull[];
}) {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const update = (key: string, patch: Partial<ComponentDraft>) =>
    onChange(components.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const remove = (key: string) => onChange(components.filter((c) => c.key !== key));

  const move = (key: string, delta: -1 | 1) => {
    const i = components.findIndex((c) => c.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= components.length) return;
    const next = [...components];
    const [row] = next.splice(i, 1);
    next.splice(j, 0, row!);
    onChange(next);
  };

  const duplicate = (key: string) => {
    const i = components.findIndex((c) => c.key === key);
    const src = components[i];
    if (!src) return;
    const copy: ComponentDraft = {
      key: crypto.randomUUID(),
      name: `${src.name} copy`,
      description: src.description,
      css: src.css,
      markup: src.markup,
    };
    const next = [...components];
    next.splice(i + 1, 0, copy);
    onChange(next);
    setOpenKeys((prev) => new Set(prev).add(copy.key));
  };

  const add = () => {
    const draft: ComponentDraft = {
      key: crypto.randomUUID(),
      name: "New component",
      description: "",
      css: "",
      markup: "",
    };
    onChange([...components, draft]);
    setOpenKeys((prev) => new Set(prev).add(draft.key));
  };

  const onImported = (imported: DesignSystemComponentInput[]) => {
    onChange([...components, ...draftsFromInputs(imported)]);
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
        <Cluster gap="1" align="center">
          <Button size="sm" variant="ghost" onClick={() => setImportOpen(true)}>
            <Import className="size-3.5" />
            Import from repo
          </Button>
          <Button size="sm" variant="ghost" onClick={add}>
            <Plus className="size-3.5" />
            Add component
          </Button>
        </Cluster>
      </Cluster>

      {components.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-3 text-center text-xs text-[var(--text-muted)]">
          No components yet. Generate a system with AI, import from a repo, or
          add one by hand.
        </p>
      ) : (
        <Stack gap="1.5" as="ul">
          {components.map((c, i) => (
            <ComponentRow
              key={c.key}
              component={c}
              systemCss={css}
              open={openKeys.has(c.key)}
              first={i === 0}
              last={i === components.length - 1}
              onToggle={() => toggle(c.key)}
              onChange={(patch) => update(c.key, patch)}
              onRemove={() => remove(c.key)}
              onMoveUp={() => move(c.key, -1)}
              onMoveDown={() => move(c.key, 1)}
              onDuplicate={() => duplicate(c.key)}
            />
          ))}
        </Stack>
      )}

      <ImportComponentsDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        repos={repos}
        css={css}
        onImported={onImported}
      />
    </Stack>
  );
}

const ICON_BUTTON =
  "rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-40 disabled:hover:bg-transparent";

function ComponentRow({
  component,
  systemCss,
  open,
  first,
  last,
  onToggle,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: {
  component: ComponentDraft;
  systemCss: string;
  open: boolean;
  first: boolean;
  last: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<ComponentDraft>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDuplicate: () => void;
}) {
  const label = component.name || "Untitled component";
  return (
    <li className="overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface)]">
      <Cluster justify="between" align="center" className="px-2.5 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {open ? (
            <ChevronDown className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />
          )}
          <span className="truncate">{label}</span>
        </button>
        <Cluster gap="0.5" align="center" className="shrink-0 flex-nowrap">
          <button type="button" onClick={onMoveUp} disabled={first} aria-label={`Move ${label} up`} className={ICON_BUTTON}>
            <ArrowUp className="size-3.5" aria-hidden />
          </button>
          <button type="button" onClick={onMoveDown} disabled={last} aria-label={`Move ${label} down`} className={ICON_BUTTON}>
            <ArrowDown className="size-3.5" aria-hidden />
          </button>
          <button type="button" onClick={onDuplicate} aria-label={`Duplicate ${label}`} className={ICON_BUTTON}>
            <Copy className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </Cluster>
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
          <MiniPreview systemCss={systemCss} component={component} />
        </Stack>
      )}
    </li>
  );
}

/** Live, inert single-component preview (sandbox="" iframe over the system css
 *  + this component's css). The DEBOUNCED value is the built HTML string (a
 *  primitive) so typing stays smooth - debouncing a fresh object literal would
 *  re-trigger the debounce effect every render, a perpetual 300 ms loop. */
function MiniPreview({ systemCss, component }: { systemCss: string; component: ComponentDraft }) {
  const built = useMemo(
    () =>
      buildComponentPreviewHtml(systemCss, {
        name: component.name,
        css: component.css,
        markup: component.markup,
      }),
    [systemCss, component.name, component.css, component.markup],
  );
  const html = useDebouncedValue(built, 300);
  return (
    <Stack gap="1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        Preview
      </span>
      <iframe
        title={`${component.name || "Component"} preview`}
        srcDoc={html}
        sandbox=""
        className="h-28 w-full rounded-md border border-[var(--border)] bg-[var(--surface)]"
      />
    </Stack>
  );
}
