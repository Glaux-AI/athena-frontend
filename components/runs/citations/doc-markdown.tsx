"use client";

/**
 * DocMarkdown — renders a run-phase document body as fully-formatted
 * markdown (GFM: headings, bold/italic, ordered + unordered lists, tables,
 * links, fenced + inline code, blockquotes, task lists) WHILE preserving the
 * `kn://…` / `repo://…` citation chips wired to a single hoisted
 * `<CitationDrawer>`.
 *
 * Shared by every per-phase document renderer (`prd`/`spec`/`plan`/
 * `implement`/`review`/`ci`/`pr`) so the markdown + citation behaviour lives
 * in one place instead of being copy-pasted into seven files. Replaces the
 * earlier text-first `<CitationRenderer>` body usage, which showed `#`/`**`/
 * tables literally.
 *
 * Citation preservation strategy — a tiny self-contained rehype pass walks
 * the rendered HAST and splits `kn://…` / `repo://…` matches out of text
 * nodes into anchor nodes carrying a private `athena-cite:` scheme (skipping
 * any subtree under `<code>`/`<pre>` so refs inside code stay literal). The
 * custom `a` renderer then turns those anchors into `<CitationChip>`s; every
 * other link renders as a normal external link. GFM autolinking only covers
 * http(s)/www/email, so custom-scheme refs would otherwise render as plain
 * text — the rehype split is what makes them clickable without a brittle
 * string pre-pass that would also corrupt refs inside fenced code.
 *
 * Mermaid + code-copy behaviour mirrors `components/chat/chat-markdown.tsx`.
 * No `dangerouslySetInnerHTML`; tokens-only styling.
 */

import {
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTheme } from "next-themes";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/cn";

import { CitationChip, type CitationSource } from "./citation-chip";
import { CitationDrawer } from "./citation-drawer";

/* -------------------------------------------------------------------------- */
/* Citation tokenisation                                                      */
/* -------------------------------------------------------------------------- */

/** Matches both `kn://…` and `repo://…` references — same grammar as the
 *  legacy `CitationRenderer` (printable non-space ref body; the FE source
 *  format for these refs does not allow embedded spaces). */
const CITATION_PATTERN = /(kn|repo):\/\/(\S+)/g;

/** Private link scheme we route citation refs through so the `a` renderer can
 *  tell a citation apart from an ordinary link. */
const CITE_SCHEME = "athena-cite:";

/** Trailing punctuation that is almost always prose, not part of the ref
 *  (a sentence-final `kn://…/file.py.` should not swallow the period). */
function splitTrailingPunct(ref: string): { ref: string; trailing: string } {
  const m = /[.,;:!?)\]]+$/.exec(ref);
  if (!m) return { ref, trailing: "" };
  return { ref: ref.slice(0, m.index), trailing: m[0] };
}

/** Build the private citation href carrying scheme + ref. */
function citationHref(source: CitationSource, ref: string): string {
  return `${CITE_SCHEME}${source}:${encodeURIComponent(ref)}`;
}

function parseCitationHref(href: string): { source: CitationSource; ref: string } | null {
  if (!href.startsWith(CITE_SCHEME)) return null;
  const rest = href.slice(CITE_SCHEME.length);
  const sep = rest.indexOf(":");
  if (sep === -1) return null;
  return {
    source: rest.slice(0, sep) as CitationSource,
    ref: decodeURIComponent(rest.slice(sep + 1)),
  };
}

/** Preserve our private scheme; defer everything else to react-markdown's
 *  default URL sanitiser (which would otherwise strip the unknown scheme). */
const transformCitationUrl = (url: string): string =>
  url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url);

/* -------------------------------------------------------------------------- */
/* rehype: split kn://, repo:// out of text nodes into citation anchors       */
/* -------------------------------------------------------------------------- */

// Minimal HAST shapes — we only touch the fields we read/write, so we avoid
// pulling `@types/hast` (not a declared dep) while staying type-safe enough.
interface HastText {
  type: "text";
  value: string;
}
interface HastElement {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown>;
  children: HastNode[];
}
interface HastRoot {
  type: "root";
  children: HastNode[];
}
type HastNode = HastText | HastElement | HastRoot | { type: string; [k: string]: unknown };

function isElement(node: HastNode): node is HastElement {
  return node.type === "element";
}
function isText(node: HastNode): node is HastText {
  return node.type === "text" && typeof (node as HastText).value === "string";
}

/** Turn one text node's value into a mix of text + citation-anchor nodes. */
function tokenizeTextValue(value: string): HastNode[] {
  const out: HastNode[] = [];
  let lastIndex = 0;
  // Fresh regex per call — the module-level one carries `g`/`lastIndex`.
  const re = new RegExp(CITATION_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const [whole, scheme, rawBody] = match;
    const { ref: body, trailing } = splitTrailingPunct(rawBody!);
    if (match.index > lastIndex) {
      out.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }
    const ref = `${scheme}://${body}`;
    out.push({
      type: "element",
      tagName: "a",
      properties: { href: citationHref(scheme as CitationSource, ref) },
      children: [{ type: "text", value: ref }],
    });
    if (trailing) out.push({ type: "text", value: trailing });
    lastIndex = match.index + whole.length;
  }
  if (out.length === 0) return [{ type: "text", value }];
  if (lastIndex < value.length) {
    out.push({ type: "text", value: value.slice(lastIndex) });
  }
  return out;
}

/** Recursively rewrite text nodes outside of code/pre/anchor subtrees. */
function walk(node: HastNode): void {
  if (!("children" in node) || !Array.isArray((node as HastElement).children)) return;
  const parent = node as HastElement | HastRoot;
  const next: HastNode[] = [];
  for (const child of parent.children) {
    if (isText(child)) {
      next.push(...tokenizeTextValue(child.value));
      continue;
    }
    if (isElement(child)) {
      // Don't linkify inside code spans/blocks or existing links.
      if (child.tagName === "code" || child.tagName === "pre" || child.tagName === "a") {
        next.push(child);
        continue;
      }
      walk(child);
    }
    next.push(child);
  }
  parent.children = next;
}

/** A self-contained rehype plugin (no external unist deps) that splits
 *  `kn://` / `repo://` refs in text into citation anchors. */
function rehypeCitations() {
  return (tree: HastRoot) => {
    walk(tree);
  };
}

/* -------------------------------------------------------------------------- */
/* Markdown element renderers (mirrors chat-markdown)                         */
/* -------------------------------------------------------------------------- */

/** Flatten a react-markdown code node back to its source text. */
function codeText(child: ReactNode): string {
  if (typeof child === "string") return child;
  if (typeof child === "number") return String(child);
  if (Array.isArray(child)) return child.map(codeText).join("");
  if (isValidElement(child)) return codeText((child.props as { children?: ReactNode }).children);
  return "";
}

/** True when a `<pre>`'s child is a fenced ```mermaid block. */
function isMermaidPre(child: ReactNode): boolean {
  return (
    isValidElement(child) &&
    typeof (child.props as { className?: string }).className === "string" &&
    /\blanguage-mermaid\b/.test((child.props as { className?: string }).className!)
  );
}

const BASE_COMPONENTS: Components = {
  pre({ children }) {
    if (isMermaidPre(children)) return <>{children}</>;
    return <CodeBlock>{children}</CodeBlock>;
  },
  code({ className, children }) {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    if (lang === "mermaid") {
      return <MermaidDiagram chart={codeText(children).replace(/\n+$/, "")} />;
    }
    const isBlock = /language-/.test(className ?? "") || String(children ?? "").includes("\n");
    if (isBlock) {
      return <code className={cn("font-mono", className)}>{children}</code>;
    }
    return (
      <code className="rounded bg-[var(--code-bg)] px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-xs">{children}</table>
      </div>
    );
  },
};

/* -------------------------------------------------------------------------- */
/* DocMarkdown                                                                */
/* -------------------------------------------------------------------------- */

export function DocMarkdown({
  content,
  className,
}: {
  /** Markdown source (the document's `body_markdown`). */
  content: string;
  className?: string;
}) {
  const [openSource, setOpenSource] = useState<CitationSource | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);

  const openChip = useCallback((source: CitationSource, ref: string) => {
    setOpenSource(source);
    setOpenRef(ref);
  }, []);
  const closeDrawer = useCallback(() => {
    setOpenSource(null);
    setOpenRef(null);
  }, []);

  const components = useMemo<Components>(
    () => ({
      ...BASE_COMPONENTS,
      a({ children, href }) {
        const cite = href ? parseCitationHref(href) : null;
        if (cite) {
          return (
            <CitationChip
              source={cite.source}
              ref={cite.ref}
              label={cite.ref}
              onOpen={() => openChip(cite.source, cite.ref)}
            />
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--primary)] underline underline-offset-2 hover:opacity-80"
          >
            {children}
          </a>
        );
      },
    }),
    [openChip],
  );

  return (
    <>
      <div
        data-testid="doc-markdown"
        className={cn(
          "text-sm leading-relaxed break-words text-[var(--text)]",
          "[&_p]:my-1.5 [&>:first-child]:mt-0 [&>:last-child]:mb-0",
          "[&_h1]:mb-1.5 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-[var(--text)]",
          "[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-[var(--text)]",
          "[&_h3]:mb-1 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-[var(--text)]",
          "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:my-0.5 [&_li>ul]:my-0.5 [&_li>ol]:my-0.5",
          "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--text-muted)]",
          "[&_th]:border [&_th]:border-[var(--border)] [&_th]:bg-[var(--surface-2)] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-[var(--border)] [&_td]:px-2 [&_td]:py-1",
          "[&_hr]:my-3 [&_hr]:border-[var(--border)] [&_strong]:font-semibold",
          "[&_a]:text-[var(--primary)]",
          className,
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeCitations]}
          urlTransform={transformCitationUrl}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
      <CitationDrawer
        open={openSource !== null && openRef !== null}
        source={openSource}
        refValue={openRef}
        onClose={closeDrawer}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Code block + mermaid (mirrors chat-markdown)                               */
/* -------------------------------------------------------------------------- */

/** A fenced code block with a hover copy button. */
function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = codeText(children).replace(/\n$/, "");

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 text-[0.8rem] leading-relaxed">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] group-hover:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-[var(--success)]" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

/** Render one mermaid diagram to static SVG. Mermaid is dynamically imported
 *  (kept out of the main bundle), validated before render so an incomplete
 *  diagram degrades quietly, and re-rendered on theme change. On a parse
 *  error we fall back to the raw source in a code box. */
function MermaidDiagram({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const mermaid = (await import("mermaid")).default;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme: resolvedTheme === "dark" ? "dark" : "neutral",
            fontFamily: "inherit",
          });
          if (typeof mermaid.parse === "function") {
            const valid = await mermaid.parse(chart, { suppressErrors: true });
            if (cancelled) return;
            if (!valid) {
              setError(true);
              return;
            }
          }
          const id = `mmd-${Math.random().toString(36).slice(2)}`;
          const { svg } = await mermaid.render(id, chart);
          if (!cancelled && ref.current) {
            ref.current.innerHTML = svg;
            setError(false);
          }
        } catch {
          if (!cancelled) setError(true);
        }
      })();
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chart, resolvedTheme]);

  if (error) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 text-[0.8rem]">
        <code className="font-mono">{chart}</code>
      </pre>
    );
  }
  return (
    <div
      ref={ref}
      role="img"
      aria-label="Diagram"
      className="my-2 flex justify-center overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 [&_svg]:h-auto [&_svg]:max-w-full"
    />
  );
}
