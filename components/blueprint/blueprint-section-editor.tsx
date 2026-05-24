"use client";

/**
 * BlueprintSectionEditor — drawer for user-editing a Blueprint section.
 *
 * Per knowledge-model.md §5.4: any user edit creates a new revision and
 * flips `protected_from_ai=true` server-side. The editor is a plain textarea
 * over the raw markdown — fancy markdown editors are deferred to a later
 * milestone (the blueprint calls it out explicitly).
 */

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BlueprintSection } from "@/lib/api/client";

export interface BlueprintSectionEditorProps {
  /** When `null`, the drawer is closed. */
  section: BlueprintSection | null;
  /** Persist the edit and close. Caller calls the appropriate scope's
   * `api.blueprint.*.editSection` and refreshes downstream state. */
  onSave: (next: { body_markdown: string; change_note: string }) => Promise<void> | void;
  onClose: () => void;
}

export function BlueprintSectionEditor({ section, onSave, onClose }: BlueprintSectionEditorProps) {
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the textarea whenever the editor opens on a new section.
  useEffect(() => {
    if (section) {
      setBody(section.body_markdown ?? "");
      setNote("");
      setError(null);
    }
  }, [section]);

  if (!section) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave({ body_markdown: body, change_note: note });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your edit.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end bg-[var(--overlay)]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Edit section ${section.title}`}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-2xl flex-col border-l border-[var(--border)] bg-[var(--surface)] shadow-xl"
      >
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] px-4 py-3">
          <Stack gap="0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
              Edit section
            </span>
            <h2 className="text-base font-semibold">{section.title}</h2>
          </Stack>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="size-4" />
          </button>
        </Cluster>

        <div className="flex-1 overflow-y-auto p-4">
          <Stack gap="3">
            <Card className="border-[var(--border-strong)] bg-[var(--info-soft)] py-2">
              <p className="text-xs text-[var(--info)]">
                Your edit will create a new revision and mark this section as protected. AI
                changes after this will queue as proposals for your review.
              </p>
            </Card>

            <label className="block text-sm">
              <span className="mb-1 inline-block font-medium">Body (Markdown)</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={22}
                className="blueprint-prose w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--text)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                placeholder={"# Section title\n\nWrite the section body in markdown."}
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 inline-block font-medium">Change note (optional)</span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Why are you making this edit?"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>

            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </Stack>
        </div>

        <Cluster justify="end" gap="2" className="border-t border-[var(--border)] px-4 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            Save revision
          </Button>
        </Cluster>
      </aside>
    </div>
  );
}
