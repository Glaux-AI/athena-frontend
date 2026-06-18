"use client";

/**
 * MarkdownLite - a minimal, dependency-free markdown renderer, plus the
 * `stripLeadingTitleHeading` helper.
 *
 * Lives in `components/ui` as a LEAF (it imports nothing from feature surfaces)
 * so both the Blueprint section viewer and the artifact `Callout` block can use
 * it without an import cycle: the block-aware `ChatMarkdown` imports the blocks
 * from `athena-blocks`, which renders a callout body with this - if this lived in
 * `blueprint-section-viewer` (which now imports `ChatMarkdown`) the graph would
 * close a cycle. Covers the section catalog's needs: headings, paragraphs,
 * lists, GFM tables, inline code, code blocks, bold. Swap for a full
 * react-markdown when the FE consolidates on one.
 */

import type { ReactNode } from "react";

/**
 * The section title is already rendered as the card heading, so a body that
 * leads with `# <Title>` would print it twice. Real BE section builders emit
 * heading-less bodies (their synthesis prompts say "no headings, markdown
 * paragraphs only"), so for live data this is a no-op - but the mock fixtures
 * (and any hand-authored section) can lead with the title, so drop that one
 * leading heading when it matches. Sub-headings (`##` ...) are left intact.
 */
export function stripLeadingTitleHeading(markdown: string, title: string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && !(lines[i] ?? "").trim()) i++;
  const heading = (lines[i] ?? "").match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
  if (heading && norm(heading[1] ?? "") === norm(title)) {
    const rest = lines.slice(i + 1);
    while (rest.length && !(rest[0] ?? "").trim()) rest.shift();
    return rest.join("\n");
  }
  return markdown;
}

/**
 * Minimal markdown renderer for the Blueprint body and callout text. This
 * covers the section catalog's needs: headings, paragraphs, lists, GFM tables,
 * inline code, code blocks, bold.
 *
 * Parses LINE-BY-LINE (not blank-line blocks). The old block-split renderer
 * classified each block by its first characters, so a "## Heading" block
 * swallowed any list beneath it into the heading text, and pipe tables - which
 * start with none of #/```/-/* - fell through to <p> and rendered as raw `|`
 * pipes. The line scanner emits a heading, then the list, then the table as
 * distinct nodes.
 */
export function MarkdownLite({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  const at = (n: number): string => lines[n] ?? "";
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const raw = at(i);
    const t = raw.trim();
    if (!t) { i++; continue; }

    // Fenced code block - consume until the closing fence.
    if (t.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !at(i).trim().startsWith("```")) { buf.push(at(i)); i++; }
      i++; // skip closing fence
      out.push(
        <pre key={key++} className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-xs">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // GFM table - a pipe row immediately followed by a separator row.
    if (isTableRow(raw) && isTableSeparator(at(i + 1))) {
      const header = splitRow(raw);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(at(i))) { rows.push(splitRow(at(i))); i++; }
      out.push(renderTable(key++, header, rows));
      continue;
    }

    // Headings - longest marker first.
    if (t.startsWith("### ")) { out.push(<h3 key={key++} className="text-sm font-semibold">{inlineFmt(t.slice(4))}</h3>); i++; continue; }
    if (t.startsWith("## "))  { out.push(<h2 key={key++} className="text-base font-semibold">{inlineFmt(t.slice(3))}</h2>); i++; continue; }
    if (t.startsWith("# "))   { out.push(<h1 key={key++} className="text-lg font-semibold">{inlineFmt(t.slice(2))}</h1>); i++; continue; }

    // Bullet list - consecutive `- ` / `* ` lines.
    if (isListItem(t)) {
      const items: string[] = [];
      while (i < lines.length && isListItem(at(i).trim())) {
        items.push(at(i).trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        <ul key={key++} className="list-disc pl-5">
          {items.map((it, j) => <li key={j} className="pl-1">{inlineFmt(it)}</li>)}
        </ul>,
      );
      continue;
    }

    // Paragraph - gather consecutive plain lines until the next block starts.
    const para: string[] = [];
    while (i < lines.length && at(i).trim() && !isBlockStart(at(i))) { para.push(at(i).trim()); i++; }
    out.push(<p key={key++}>{inlineFmt(para.join(" "))}</p>);
  }
  return <div className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--text)]">{out}</div>;
}

function isListItem(t: string): boolean {
  return t.startsWith("- ") || t.startsWith("* ");
}

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
  return t.split("|").map((c) => c.trim());
}

function isBlockStart(line: string): boolean {
  const t = line.trim();
  return t.startsWith("#") || t.startsWith("```") || isListItem(t) || isTableRow(line);
}

function renderTable(key: number, header: string[], rows: string[][]): ReactNode {
  return (
    <div key={key} className="overflow-x-auto rounded-md border border-[var(--border)]">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]">
            {header.map((h, j) => (
              <th key={j} className="px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{inlineFmt(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--border)] transition-colors duration-150 ease-out last:border-0 hover:bg-[var(--surface-2)]">
              {row.map((c, ci) => (
                <td key={ci} className="px-2 py-1 align-top text-[var(--text)]">{inlineFmt(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Inline markdown: **bold** and `code`. Kept deliberately minimal. */
function inlineFmt(s: string): ReactNode {
  const parts: ReactNode[] = [];
  let i = 0;
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(s)) !== null) {
    if (match.index > i) parts.push(s.slice(i, match.index));
    if (match[2]) parts.push(<strong key={parts.length}>{match[2]}</strong>);
    else if (match[4]) parts.push(<code key={parts.length} className="rounded bg-[var(--surface-2)] px-1 py-0.5 font-mono text-[11px]">{match[4]}</code>);
    i = re.lastIndex;
  }
  if (i < s.length) parts.push(s.slice(i));
  return parts;
}
