/**
 * Athena adaptive visual blocks - the two model-composable artifact blocks.
 *
 * Artifacts (plans / PRDs / manifests) and blueprint prose are composed from
 * ADAPTIVE blocks the model picks per task - there is no fixed section
 * template. Two of those blocks are bespoke and live here; the rest
 * (```mermaid, GFM tables, the change_manifest table, task lists, prose) are
 * already rendered by the markdown pipeline.
 *
 * TRANSPORT: each block is a fenced code block with an `athena-*` info string,
 * routed by `chat-markdown`'s existing code-fence router (the same mechanism
 * that turns a ```mermaid fence into an SVG). The body is plain text - NOT
 * YAML - read by `parseBlock` below: a total, never-throwing reader that has
 * no colon/whitespace foot-guns and no dependency.
 *
 *   1. ```athena-summary  - the GLANCE card. Leads a non-trivial artifact:
 *      a prominent tldr line + a Cluster of labeled stat pills.
 *   2. ```athena-callout  - an aside / risk / note: a left-accent toned box.
 *
 * DEGRADATION: a block that parses to nothing useful renders null (the caller's
 * router falls back to an ordinary code block). Neither function throws.
 * tokens-only colors, WCAG AA (semantic `-soft` / `-ink` pairs).
 */

import { Info, AlertTriangle, ShieldAlert, CheckCircle2, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { MarkdownLite } from "@/components/ui/markdown-lite";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------------------- */
/* Block body parser                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Read a block body into `{ attrs, body }`. TOTAL - never throws.
 *
 * A line `key: value` (split on the FIRST `": "`) is an ATTRIBUTE. Lines that
 * are not key:value, and EVERYTHING after the first blank line, form the
 * free-text body. Values may contain `:` (a path like `app/api.py:42` is fine -
 * the first `": "` wins). Blank attribute lines are ignored; the key is
 * trimmed and lower-cased so `Type:` and `type:` read the same. This is not
 * YAML: a small deterministic reader with no whitespace foot-guns.
 */
export function parseBlock(src: string): { attrs: Record<string, string>; body: string } {
  const attrs: Record<string, string> = {};
  const bodyLines: string[] = [];
  let inBody = false;
  let seenAttr = false;
  const lines = (src ?? "").replace(/\r\n/g, "\n").split("\n");

  for (const raw of lines) {
    if (inBody) {
      bodyLines.push(raw);
      continue;
    }
    // A blank line ends the attribute head and starts the body - but a blank
    // line BEFORE any attribute (a stray leading newline after the fence) is
    // ignored, so the head still reads.
    if (raw.trim() === "") {
      if (seenAttr) inBody = true;
      continue;
    }
    const sep = raw.indexOf(": ");
    const key = sep > 0 ? raw.slice(0, sep).trim().toLowerCase() : "";
    if (sep > 0 && key && !key.includes(" ")) {
      attrs[key] = raw.slice(sep + 2).trim();
      seenAttr = true;
    } else {
      // A non-attribute line in the head starts the body (and itself is body).
      inBody = true;
      bodyLines.push(raw);
    }
  }
  return { attrs, body: bodyLines.join("\n").trim() };
}

/* -------------------------------------------------------------------------- */
/* athena-summary - the glance card                                           */
/* -------------------------------------------------------------------------- */

interface Chip {
  label: string;
  value: string;
}

/** Parse the `chips` attribute: ` · ` or `,` separated `label=value` pairs.
 *  A bare entry with no `=` becomes a value-only pill (no muted label). */
function parseChips(raw: string | undefined): Chip[] {
  if (!raw) return [];
  return raw
    .split(/\s+·\s+|,/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      return eq > 0
        ? { label: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() }
        : { label: "", value: part };
    });
}

/** Numeric-leading values get tabular-nums so columns of pills line up. */
const NUMERIC_LEAD = /^[~<>]?\d/;

/** True when a summary block has content worth a card (else the caller renders
 *  it as a plain code block). Lets the router decide WITHOUT invoking the
 *  component, so degradation stays a pure, testable check. */
export function isRenderableSummary(source: string): boolean {
  const { attrs } = parseBlock(source);
  return Boolean(attrs["tldr"]?.trim()) || parseChips(attrs["chips"]).length > 0;
}

/**
 * SummaryCard - the first block of any non-trivial artifact. A prominent tldr
 * lead line plus a Cluster of labeled stat pills. Empty (no tldr, no chips) ->
 * render null so the caller degrades to a plain code block.
 */
export function SummaryCard({ source }: { source: string }) {
  const { attrs } = parseBlock(source);
  const tldr = attrs["tldr"]?.trim();
  const chips = parseChips(attrs["chips"]);
  if (!tldr && chips.length === 0) return null;

  return (
    <Card data-testid="athena-summary" className="my-3">
      <Stack gap="3">
        {tldr && (
          <p className="text-sm font-medium leading-relaxed text-[var(--text)]">{tldr}</p>
        )}
        {chips.length > 0 && (
          <Cluster gap="2" align="center">
            {chips.map((chip, i) => (
              <span
                key={i}
                className="inline-flex items-baseline gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs"
              >
                {chip.label && (
                  <span className="text-[var(--text-muted)]">{chip.label}</span>
                )}
                <span
                  className={cn(
                    "font-medium text-[var(--text)]",
                    NUMERIC_LEAD.test(chip.value) && "tabular-nums",
                  )}
                >
                  {chip.value}
                </span>
              </span>
            ))}
          </Cluster>
        )}
      </Stack>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* athena-callout - an aside / risk / note                                    */
/* -------------------------------------------------------------------------- */

type CalloutTone = "info" | "warn" | "risk" | "success";

/**
 * Map a callout tone to its semantic token family + icon. `risk` borrows the
 * `danger` family, `warn` the `warning` family - each `bg -soft` + `text -ink`
 * is an AA pair. The classes are spelled out in FULL (not interpolated) so the
 * Tailwind JIT actually emits them - same idiom as `TaskStatusPill`'s style map.
 */
const CALLOUT_TONE: Record<CalloutTone, { className: string; Icon: LucideIcon }> = {
  info: {
    className: "border-l-[var(--info)] bg-[var(--info-soft)] text-[var(--info-ink)]",
    Icon: Info,
  },
  warn: {
    className: "border-l-[var(--warning)] bg-[var(--warning-soft)] text-[var(--warning-ink)]",
    Icon: AlertTriangle,
  },
  risk: {
    className: "border-l-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger-ink)]",
    Icon: ShieldAlert,
  },
  success: {
    className: "border-l-[var(--success)] bg-[var(--success-soft)] text-[var(--success-ink)]",
    Icon: CheckCircle2,
  },
};

function toneOf(raw: string | undefined): CalloutTone {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "warn" || t === "risk" || t === "success" ? t : "info";
}

/** True when a callout block has a title or a body (else the caller renders it
 *  as a plain code block). The pure-check twin of `isRenderableSummary`. */
export function isRenderableCallout(source: string): boolean {
  const { attrs, body } = parseBlock(source);
  return Boolean(attrs["title"]?.trim()) || Boolean(body);
}

/**
 * Callout - a left-accent toned box for a risk / caveat / note. The tone
 * selects a semantic token family (bg `-soft`, text `-ink`, a left accent rule)
 * + a lucide icon; an unknown type falls back to `info`. The body renders with
 * minimal inline markdown via the shared `MarkdownLite`. tokens-only, AA.
 */
export function Callout({ source }: { source: string }) {
  const { attrs, body } = parseBlock(source);
  const tone = toneOf(attrs["type"]);
  const title = attrs["title"]?.trim();
  if (!title && !body) return null;

  const { className, Icon } = CALLOUT_TONE[tone];
  return (
    <div
      data-testid="athena-callout"
      data-tone={tone}
      role="note"
      className={cn("my-3 flex gap-2.5 rounded-lg border-l-4 p-3", className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <Stack gap="1" className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {body && <MarkdownLite source={body} />}
      </Stack>
    </div>
  );
}
