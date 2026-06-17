/**
 * Parse a `change_manifest` / `fix_plan` artifact body into a render-time view
 * of "what is going to change".
 *
 * The model writes the body as plain markdown per the `change_manifest` spec
 * (the Changes section as a table with `File / Change / Location / Why`). This
 * module locates that table deterministically and exposes its rows so the
 * renderer can lead with a count chip and show an interactive change-table -
 * WITHOUT asking the model for any extra structure (zero added tokens) and
 * WITHOUT inferring a change-kind from prose (the badge is read only from a
 * real `Change` column the model wrote).
 *
 * It never throws and never loses content: a body with no recognizable
 * change-table parses to `table: null`, and the caller renders the whole body
 * as ordinary markdown. The table-detection helpers mirror the blueprint
 * `MarkdownLite` parser so a GFM table reads identically in both places.
 */

export type ChangeKind = "add" | "modify" | "delete" | "other";

export interface ChangeTable {
  /** Header labels, in the order the model wrote them. */
  headers: string[];
  /** Body rows, cells aligned to `headers` by index. */
  rows: string[][];
  /** Index of the file/path column - the change-table's signature (>= 0). */
  fileIdx: number;
  /** Index of the add/modify/delete column, or -1 when the model wrote none. */
  changeIdx: number;
}

export interface ParsedChangeManifest {
  /** The change-table, or null for a body with none (trivial / legacy / foreign). */
  table: ChangeTable | null;
  /** Markdown before the table (rendered as-is). */
  before: string;
  /** Markdown after the table - e.g. Risks + CHANGE CHECKLIST (rendered as-is). */
  after: string;
}

export interface ChangeSummary {
  total: number;
  added: number;
  modified: number;
  removed: number;
  /** True when the source had a Change column, so the breakdown is real data
   *  rather than an unknown (never inferred). */
  typed: boolean;
}

/** A header naming the file/path column - the change-table's signature. */
const FILE_HEADER = /^(file|files|path|paths)$/i;
/** A header naming the add/modify/delete column. */
const CHANGE_HEADER = /^(change|changes|action|type|kind|op|operation)$/i;

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.includes("-") && /^\|?[\s:|-]+\|?$/.test(t);
}

function splitRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  // Split on UNescaped pipes only - GFM (and so the prose the body renders
  // through) treats `\|` as a literal pipe inside one cell, so the table reads
  // the same here as in `ArtifactMarkdown`. Then unescape for display.
  return t.split(/(?<!\\)\|/).map((c) => c.replace(/\\\|/g, "|").trim());
}

/** Strip the markdown emphasis/backticks a cell may carry, for display + matching. */
function cleanCell(s: string): string {
  return s.replace(/[`*]/g, "").trim();
}

function columnIndex(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(cleanCell(h)));
}

/**
 * Locate the first GFM table whose header carries a file/path column (the
 * change-table's signature) and return it plus the prose around it. A document
 * that leads with some other table is skipped over until the change-table is
 * found; a body with none returns `table: null`.
 */
export function parseChangeManifest(body: string): ParsedChangeManifest {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    // Skip fenced code blocks so a pipe-table shown INSIDE a ``` example (or a
    // quoted snippet) is never mistaken for the change-table - mirrors how the
    // blueprint MarkdownLite parser consumes fences first.
    const fenceLine = lines[i]?.trimStart() ?? "";
    if (fenceLine.startsWith("```") || fenceLine.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!isTableRow(lines[i] ?? "") || !isTableSeparator(lines[i + 1] ?? "")) continue;
    const headers = splitRow(lines[i] ?? "");
    const fileIdx = columnIndex(headers, FILE_HEADER);
    if (fileIdx < 0) continue; // not the change-table - keep scanning
    let j = i + 2;
    const rows: string[][] = [];
    while (j < lines.length && isTableRow(lines[j] ?? "")) {
      rows.push(splitRow(lines[j] ?? ""));
      j++;
    }
    if (rows.length === 0) continue;
    return {
      table: { headers, rows, fileIdx, changeIdx: columnIndex(headers, CHANGE_HEADER) },
      before: lines.slice(0, i).join("\n"),
      after: lines.slice(j).join("\n"),
    };
  }
  return { table: null, before: body, after: "" };
}

/**
 * Normalize a Change-column cell the model wrote ("Add", "New file",
 * "Modify", "Delete", "Remove", ...) into a coarse kind. The cell is a real
 * column the author wrote; this maps its words, it never infers from a path or
 * prose. An unrecognized value is `other` (shown as plain text, no badge).
 */
export function normalizeChangeKind(raw: string): ChangeKind {
  const t = cleanCell(raw).toLowerCase();
  if (/(delet|remov|drop)/.test(t)) return "delete";
  if (/(add|new|creat|introduc)/.test(t)) return "add";
  if (/(modif|updat|chang|edit|refactor|rework|adjust|extend|rename|tweak)/.test(t)) return "modify";
  return "other";
}

/** Count the change-table's rows by kind. The breakdown is `typed` only when
 *  the source had a Change column - otherwise just the total is meaningful. */
export function summarizeChanges(table: ChangeTable): ChangeSummary {
  const summary: ChangeSummary = {
    total: table.rows.length,
    added: 0,
    modified: 0,
    removed: 0,
    typed: table.changeIdx >= 0,
  };
  if (!summary.typed) return summary;
  for (const row of table.rows) {
    const kind = normalizeChangeKind(row[table.changeIdx] ?? "");
    if (kind === "add") summary.added++;
    else if (kind === "modify") summary.modified++;
    else if (kind === "delete") summary.removed++;
  }
  return summary;
}

export { cleanCell };
