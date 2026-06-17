"use client";

/**
 * MarkdownEditor - the artifact EDIT surface: a real WYSIWYG editor over a
 * markdown document model (TipTap/ProseMirror), so editing a plan/PRD/manifest
 * is proper UI - headings, lists, tables-as-tables, task-list checkboxes, bold
 * and code - never a raw `font-mono` "code" textarea.
 *
 * Scoped AI edit: when `onAskAI` is wired, selecting text opens an in-place
 * editor popup anchored just under the selection (no pill, no toolbar trip) with
 * the same effort + model dials as a stage run. Only the SELECTED fragment is
 * sent, and the rewritten fragment is spliced back in place (token-frugal; no
 * stage reopen / re-run). Undoable; persists on Save like any edit.
 *
 * The wire format stays markdown: it reads the artifact's markdown `value` and
 * calls `onChange` with markdown on every edit (round-trip pinned by
 * `tests/unit/artifact-editor-roundtrip.test.ts`). No MDX, no contract churn,
 * and `html: false` keeps the no-raw-HTML posture. Lazy-loaded by the artifact
 * card. Default export so it can be `next/dynamic`-imported with `ssr: false`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import * as Popover from "@radix-ui/react-popover";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  Sparkles,
  Wand2,
} from "lucide-react";

import { buildArtifactExtensions, editorMarkdown } from "@/lib/work/artifact-editor-extensions";
import { ApiError, type EffortLevel, type ModelSelection } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import { cn } from "@/lib/cn";

/** Arguments the editor hands an `onAskAI` caller: the selected fragment, a
 *  little surrounding context, the instruction, and the picked effort/model. */
export interface SpanAskArgs {
  selection: string;
  before: string;
  after: string;
  instruction: string;
  effort: EffortLevel;
  model: ModelSelection | null;
}

/** Chars of context sent on each side of the selection (kept small - frugal). */
const CONTEXT_CHARS = 600;

/** Delay (ms) after the selection stops changing before the popup opens - keeps
 *  it from flashing mid-drag or mid keyboard-extend. */
const SETTLE_MS = 220;

/** The captured selection: its doc range, text, and geometry (relative to the
 *  editor container) for anchoring the floating popup just under the text. */
interface SelInfo {
  from: number;
  to: number;
  text: string;
  left: number;
  top: number;
}

/** Selection geometry relative to the editor container, so the popup sits just
 *  under the selected text. Returns null when there is no real selection. */
function computeSel(editor: Editor, container: HTMLElement | null): SelInfo | null {
  const { from, to } = editor.state.selection;
  if (from === to || !container) return null;
  const box = container.getBoundingClientRect();
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);
  const left = Math.min(Math.max(8, start.left - box.left), Math.max(8, box.width - 96));
  return {
    from,
    to,
    text: editor.state.doc.textBetween(from, to, "\n"),
    left,
    top: end.bottom - box.top,
  };
}

/** Prose styling for the editable surface - mirrors the read renderer so the
 *  content looks the same edited as displayed. Tokens only. */
const PROSE = cn(
  "min-h-[260px] max-h-[520px] overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2",
  "text-sm leading-relaxed text-[var(--text)] focus:outline-none",
  "[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[230px]",
  "[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-muted)]",
  "[&_code]:rounded [&_code]:bg-[var(--code-bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-[var(--border)] [&_pre]:bg-[var(--code-bg)] [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
  "[&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[var(--surface-2)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
  "[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1",
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:pl-1",
  "[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2",
  "[&_ul[data-type=taskList]_li_p]:my-0",
);

export default function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
  onAskAI,
}: {
  value: string;
  onChange: (markdown: string) => void;
  ariaLabel?: string;
  /** When provided, selecting text opens an in-place AI editor to rewrite just
   *  that part (the scoped-edit loop). Returns the replacement; the editor
   *  splices it in place. Absent => plain WYSIWYG editing, no Ask-AI affordance. */
  onAskAI?: (args: SpanAskArgs) => Promise<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<SelInfo | null>(null);
  const [open, setOpen] = useState(false);
  // Freeze the captured selection while the popup is open: editing the
  // instruction moves DOM focus off the editor, which would otherwise fire a
  // selection update and clear the range out from under us.
  const openRef = useRef(false);
  const setOpenSafe = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
  }, []);
  // The popup opens on its own once a selection settles. A short debounce keeps
  // it from flashing mid-drag; a "dismissed range" key keeps closing it from
  // immediately reopening on the same, still-highlighted selection.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dismissedKey = useRef<string | null>(null);
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const handleUpdate = useCallback(
    (editor: Editor) => onChange(editorMarkdown(editor)),
    [onChange],
  );

  const handleSelection = useCallback(
    (editor: Editor) => {
      if (openRef.current || !onAskAI) return;
      clearTimeout(settleTimer.current);
      const { from, to } = editor.state.selection;
      if (from === to) {
        dismissedKey.current = null;
        setSel(null);
        setOpenSafe(false);
        return;
      }
      if (`${from}:${to}` === dismissedKey.current) return;
      settleTimer.current = setTimeout(() => {
        const info = computeSel(editor, containerRef.current);
        if (!info) return;
        setSel(info);
        setOpenSafe(true);
      }, SETTLE_MS);
    },
    [onAskAI, setOpenSafe],
  );

  const editor = useEditor({
    extensions: buildArtifactExtensions(),
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel ?? "Edit artifact",
      },
    },
    onUpdate: ({ editor }) => handleUpdate(editor),
    onSelectionUpdate: ({ editor }) => handleSelection(editor),
  });

  if (!editor) {
    return <div className="min-h-[300px] animate-pulse rounded-md bg-[var(--surface-2)]" aria-hidden />;
  }

  // Record the just-closed range so the same highlight does not reopen the
  // popup; it reopens only when the selection changes (or clears and returns).
  const closeAsk = () => {
    if (sel) dismissedKey.current = `${sel.from}:${sel.to}`;
    setOpenSafe(false);
  };

  // Rewrite only the captured range. Errors propagate to the form (which keeps
  // itself open + shows them); on success we splice and close.
  const runAsk = async (instruction: string, effort: EffortLevel, model: ModelSelection | null) => {
    if (!onAskAI || !sel) return;
    const { from, to } = sel;
    const size = editor.state.doc.content.size;
    const before = editor.state.doc.textBetween(Math.max(0, from - CONTEXT_CHARS), from, "\n");
    const after = editor.state.doc.textBetween(to, Math.min(size, to + CONTEXT_CHARS), "\n");
    const replacement = await onAskAI({ selection: sel.text, before, after, instruction, effort, model });
    // Unfreeze BEFORE splicing so the insert's (collapsed) selection update is
    // processed - it clears `sel` and lets a fresh selection open the popup again.
    setOpenSafe(false);
    editor.chain().focus().insertContentAt({ from, to }, replacement).run();
  };

  return (
    <div ref={containerRef} className="relative rounded-md border border-[var(--border)]">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className={PROSE} />
      {onAskAI && sel && (
        <Popover.Root open={open} onOpenChange={(next) => { if (!next) closeAsk(); }}>
          <Popover.Anchor asChild>
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: sel.left, top: sel.top + 6 }}
            />
          </Popover.Anchor>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={6}
              collisionPadding={12}
              aria-label="Ask AI to change the selected part"
              // Land focus in the instruction box, not the popup container.
              onOpenAutoFocus={(e) => e.preventDefault()}
              // Keep the popup open when the click lands in a nested Radix
              // popover: the effort / model pickers portal out to the body, so
              // their clicks would otherwise read as "outside" and dismiss us.
              onInteractOutside={(e) => {
                const target = e.target as HTMLElement | null;
                if (target?.closest("[data-radix-popper-content-wrapper]")) {
                  e.preventDefault();
                }
              }}
              className={cn(
                "glass z-50 w-[26rem] max-w-[calc(100vw-1.5rem)] rounded-xl p-3 shadow-[var(--shadow-3)]",
                "animate-pop-in",
              )}
            >
              <SpanAskForm selection={sel.text} onApply={runAsk} onCancel={closeAsk} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  );
}

/** A lean, token-styled formatting bar. Markdown shortcuts (typing `## `, `- `,
 *  `1. `) also work via the editor's input rules. The Ask-AI affordance is not
 *  here - the editor opens it in place under the selection (see `MarkdownEditor`). */
function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
      <ToolBtn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-3.5" aria-hidden />
      </ToolBtn>
      <ToolBtn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-3.5" aria-hidden />
      </ToolBtn>
      <ToolBtn label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="size-3.5" aria-hidden />
      </ToolBtn>
      <Divider />
      <ToolBtn label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-3.5" aria-hidden />
      </ToolBtn>
      <ToolBtn label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-3.5" aria-hidden />
      </ToolBtn>
      <Divider />
      <ToolBtn label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-3.5" aria-hidden />
      </ToolBtn>
      <ToolBtn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-3.5" aria-hidden />
      </ToolBtn>
      <ToolBtn label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks className="size-3.5" aria-hidden />
      </ToolBtn>
      <ToolBtn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-3.5" aria-hidden />
      </ToolBtn>
    </div>
  );
}

/** The scoped-edit form (the popup body): the selected snippet, an instruction,
 *  and the SAME effort + model dials as a stage run (model picker shown only
 *  when there is a real choice). Owns its own effort/model state, mirroring the
 *  stage refine. Rendered inside the in-place popover anchored at the selection. */
function SpanAskForm({
  selection,
  onApply,
  onCancel,
}: {
  selection: string;
  onApply: (instruction: string, effort: EffortLevel, model: ModelSelection | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Same dials as every other AI run: effort always shown (remembered across
  // refreshes, "task" scope), model picker only when >1 enabled model.
  const [effort, setEffort] = usePersistedEffort("task");
  const { models } = useEnabledModels();
  const enabledModels = models.filter((m) => m.enabled);
  const [model, setModel] = useState<ModelSelection | null>(null);
  useEffect(() => {
    if (model !== null) return;
    const restored = restoreModelSelection("task", models);
    if (restored) {
      setModel(restored);
      return;
    }
    const first = models.find((m) => m.enabled);
    if (first) setModel({ provider: first.provider, model: first.id, source: first.source });
  }, [models, model]);

  const apply = async () => {
    if (!instruction.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await onApply(instruction.trim(), effort, model);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't apply that edit.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="2">
      <Cluster gap="2" align="center" className="flex-wrap">
        <Sparkles className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
        <span className="text-xs text-[var(--text-muted)]">Change just this part:</span>
        <span
          className="max-w-[320px] truncate rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]"
          title={selection}
        >
          {selection}
        </span>
      </Cluster>
      <textarea
        ref={textareaRef}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Describe the change to this part…"
        aria-label="Describe the change to the selected part"
        className="min-h-[60px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]"
        >
          {error}
        </p>
      )}
      <Cluster gap="2" align="center" className="flex-wrap">
        <Button size="sm" loading={submitting} disabled={submitting || !instruction.trim()} onClick={() => void apply()}>
          <Wand2 className="size-3.5" />
          Apply with AI
        </Button>
        <EffortSelector value={effort} onChange={setEffort} disabled={submitting} />
        {enabledModels.length > 1 && (
          <ModelSelector
            models={models}
            value={model}
            onChange={(m) => {
              setModel(m);
              storeModel("task", m);
            }}
            disabled={submitting}
          />
        )}
        <Button size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
          Cancel
        </Button>
      </Cluster>
      <p className="text-[11px] text-[var(--text-muted)]">
        Only the selected part is sent to the AI. You can undo, and the change saves when you click Save.
      </p>
    </Stack>
  );
}

function ToolBtn({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-1)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-[var(--border)]" aria-hidden />;
}
