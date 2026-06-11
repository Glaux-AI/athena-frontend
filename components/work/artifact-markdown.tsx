"use client";

/**
 * ArtifactMarkdown — full markdown rendering for artifact prose. Reuses the
 * chat renderer (`ChatMarkdown`: headings, lists, GFM tables, blockquotes,
 * fenced code with copy, and ```mermaid diagrams — no `dangerouslySetInnerHTML`)
 * and keeps the artifact citation idiom: bare `kn://…` / `repo://…` refs are
 * pre-linkified into the same chip affordance, wired to the hoisted
 * `CitationDrawer`. This replaced the hand-rolled `Prose` renderer that
 * collapsed multi-line markdown into raw-text paragraphs.
 */

import { useMemo, useState } from "react";

import { ChatMarkdown, CITE_SCHEME } from "@/components/chat/chat-markdown";
import type { CitationSource } from "@/components/runs/citations/citation-chip";
import { CitationDrawer } from "@/components/runs/citations/citation-drawer";

const URI_CITE_RE = /(kn|repo):\/\/(\S+)/g;

/** A short, readable chip label for a `kn://`/`repo://` ref — the trailing
 *  path segment (line-range suffix kept: it tells the reader where). */
function uriLabel(refBody: string): string {
  const base = refBody.split("/").pop() || refBody;
  return base.length > 40 ? `${base.slice(0, 39)}…` : base;
}

/** Rewrite bare `kn://…` / `repo://…` refs into ChatMarkdown's private
 *  citation-link scheme so they render as citation chips instead of raw URIs.
 *  Already-linkified text (inside a markdown link) is left alone by virtue of
 *  the chip label never containing the scheme. */
export function linkifyUriCitations(text: string): string {
  return text.replace(URI_CITE_RE, (_full: string, scheme: string, body: string) => {
    const ref = `${scheme}://${body}`;
    const label = uriLabel(body).replace(/[[\]]/g, "");
    return `[${label}](${CITE_SCHEME}${scheme}:${encodeURIComponent(ref)})`;
  });
}

export function ArtifactMarkdown({ text }: { text: string }) {
  const [open, setOpen] = useState<{ source: CitationSource; ref: string } | null>(
    null,
  );
  const content = useMemo(() => linkifyUriCitations(text), [text]);
  return (
    <>
      <ChatMarkdown
        content={content}
        onCitation={(source, ref) => setOpen({ source, ref })}
      />
      <CitationDrawer
        open={open !== null}
        source={open?.source ?? null}
        refValue={open?.ref ?? null}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
