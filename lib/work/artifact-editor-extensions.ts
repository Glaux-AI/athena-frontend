/**
 * The TipTap extension set for the artifact markdown editor, isolated from the
 * React component so the markdown round-trip (the one risky step) can be unit
 * tested headlessly: the editor parses markdown into a ProseMirror document and
 * serializes it back, and `roundTripMarkdown` exercises exactly that.
 *
 * Markdown stays the wire format end to end - the editor reads the artifact's
 * markdown body and writes markdown back - so there is no MDX, no contract
 * churn, and the stored body is the same shape every other author (the internal
 * LLM, the MCP executor, humans) produces. `html: false` keeps the no-raw-HTML
 * posture: the editor neither emits nor accepts embedded HTML.
 */

import { Editor, type Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

/** Fresh extension instances per editor (TipTap extensions hold per-editor
 *  state, so they are not shared across editors). */
export function buildArtifactExtensions(): Extensions {
  return [
    StarterKit,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({
      html: false,
      tightLists: true,
      bulletListMarker: "-",
      linkify: false,
      breaks: false,
      transformPastedText: true,
    }),
  ];
}

/** The markdown the editor serializes for its current document. */
export function editorMarkdown(editor: Editor): string {
  const storage = editor.storage as { markdown?: { getMarkdown(): string } };
  return storage.markdown?.getMarkdown() ?? "";
}

/** Parse markdown into the editor model and serialize it back - the exact
 *  round-trip the editor performs on load then save. Exposed for unit tests so
 *  fidelity is pinned without a browser. */
export function roundTripMarkdown(markdown: string): string {
  const editor = new Editor({ extensions: buildArtifactExtensions(), content: markdown });
  try {
    return editorMarkdown(editor);
  } finally {
    editor.destroy();
  }
}
