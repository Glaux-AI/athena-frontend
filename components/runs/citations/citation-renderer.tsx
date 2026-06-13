"use client";

/**
 * CitationRenderer - walks a markdown body, detects `kn://…` and
 * `repo://…` link patterns, and substitutes them with clickable
 * `<CitationChip>` instances connected to a single hoisted
 * `<CitationDrawer>`.
 *
 * The project does not ship a markdown AST dependency (we keep
 * `marked` / `remark` off the bundle); we use a regex split that
 * preserves text fidelity and only swaps the matched ranges. Citations
 * may appear inline (e.g. "see kn://app/billing/file.py:L12-L30 for…")
 * or as standalone tokens in a list - both render identically.
 *
 * The renderer is intentionally text-first - it does not parse markdown
 * to HTML (the per-phase components already render the rich
 * body). Use this when you need a slim, chip-aware string renderer
 * (e.g. a PRD section paragraph) or wrap larger blocks to add chip
 * affordances without a full markdown pipeline.
 */

import { useCallback, useMemo, useState } from "react";

import { cn } from "@/lib/cn";

import { CitationChip, type CitationSource } from "./citation-chip";
import { CitationDrawer } from "./citation-drawer";

/** Matches both `kn://…` and `repo://…` references. The capture groups
 *  pick out the scheme + the ref body so we can re-construct the chip
 *  without re-running the regex per chip. The body greedily matches
 *  printable non-space characters; the FE source format for these refs
 *  does not allow spaces inside the ref. */
const CITATION_PATTERN = /(kn|repo):\/\/(\S+)/g;

interface CitationRendererProps {
  /** Text to walk - typically a paragraph or list-item body. */
  text: string;
  /** Optional className applied to the wrapping `<span>`. */
  className?: string;
}

interface ParsedSegment {
  kind: "text" | "chip";
  /** When `kind === "text"`, the raw text slice. */
  text?: string;
  /** When `kind === "chip"`, the citation scheme + ref. */
  source?: CitationSource;
  ref?: string;
}

function parseSegments(text: string): ParsedSegment[] {
  if (!text) return [];
  const segments: ParsedSegment[] = [];
  let lastIndex = 0;
  // Re-create the regex per parse to avoid the cached `lastIndex` state
  // bleeding across calls (the module-level regex carries `g`).
  const regex = new RegExp(CITATION_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const [whole, scheme, refBody] = match;
    if (match.index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    }
    segments.push({
      kind: "chip",
      source: scheme as CitationSource,
      ref: `${scheme}://${refBody}`,
    });
    lastIndex = match.index + whole.length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments;
}

export function CitationRenderer({ text, className }: CitationRendererProps) {
  const [openSource, setOpenSource] = useState<CitationSource | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);

  const segments = useMemo(() => parseSegments(text), [text]);

  const openChip = useCallback((source: CitationSource, ref: string) => {
    setOpenSource(source);
    setOpenRef(ref);
  }, []);

  const closeDrawer = useCallback(() => {
    setOpenSource(null);
    setOpenRef(null);
  }, []);

  return (
    <>
      <span
        className={cn("inline-flex flex-wrap items-baseline gap-1", className)}
        data-testid="citation-renderer"
      >
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return <span key={`t-${i}`}>{seg.text}</span>;
          }
          const refStr = seg.ref as string;
          return (
            <CitationChip
              key={`c-${i}-${refStr}`}
              source={seg.source as CitationSource}
              ref={refStr}
              label={refStr}
              onOpen={() => openChip(seg.source as CitationSource, refStr)}
            />
          );
        })}
      </span>
      <CitationDrawer
        open={openSource !== null && openRef !== null}
        source={openSource}
        refValue={openRef}
        onClose={closeDrawer}
      />
    </>
  );
}
