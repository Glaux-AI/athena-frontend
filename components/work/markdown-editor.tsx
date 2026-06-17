"use client";

/**
 * MarkdownEditor - the artifact EDIT surface: a real WYSIWYG editor over a
 * markdown document model (TipTap/ProseMirror), so editing a plan/PRD/manifest
 * is proper UI - headings, lists, tables-as-tables, task-list checkboxes, bold
 * and code - never a raw `font-mono` "code" textarea.
 *
 * The wire format stays markdown: it reads the artifact's markdown `value` and
 * calls `onChange` with markdown on every edit (round-trip pinned by
 * `tests/unit/artifact-editor-roundtrip.test.ts`). No MDX, no contract churn,
 * and `html: false` keeps the no-raw-HTML posture. Lazy-loaded by the artifact
 * card (mirrors how the mermaid renderer stays out of the main bundle).
 *
 * Default export so it can be `next/dynamic`-imported with `ssr: false`.
 */

import { useCallback } from "react";
import { type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
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
} from "lucide-react";

import { buildArtifactExtensions, editorMarkdown } from "@/lib/work/artifact-editor-extensions";
import { cn } from "@/lib/cn";

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
}: {
  value: string;
  onChange: (markdown: string) => void;
  ariaLabel?: string;
}) {
  const handleUpdate = useCallback(
    (editor: Editor) => onChange(editorMarkdown(editor)),
    [onChange],
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
  });

  if (!editor) {
    return <div className="min-h-[300px] animate-pulse rounded-md bg-[var(--surface-2)]" aria-hidden />;
  }

  return (
    <div className="rounded-md border border-[var(--border)]">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className={PROSE} />
    </div>
  );
}

/** A lean, token-styled formatting bar. Markdown shortcuts (typing `## `,
 *  `- `, `1. `) also work via the editor's input rules. */
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
