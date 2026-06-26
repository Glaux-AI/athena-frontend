"use client";

/**
 * Athena adaptive visual blocks - the model-composable artifact blocks.
 *
 * Artifacts (plans / PRDs / manifests) and blueprint prose are composed from
 * ADAPTIVE blocks the model picks per task - there is no fixed section
 * template. The bespoke blocks live here; the rest (```mermaid, GFM tables,
 * the change_manifest table, task lists, prose) are rendered by the markdown
 * pipeline.
 *
 * TRANSPORT: each block is a fenced code block with an `athena-*` info string,
 * routed by `chat-markdown`'s existing code-fence router (the same mechanism
 * that turns a ```mermaid fence into an SVG). The body is plain text - NOT
 * YAML - read by `parseBlock` below: a total, never-throwing reader that has
 * no colon/whitespace foot-guns and no dependency.
 *
 *   1. ```athena-summary  - the GLANCE card. Leads a non-trivial artifact:
 *      a prominent tldr line + a Cluster of labeled stat pills (or `style:
 *      tiles` for a big-number band).
 *   2. ```athena-callout  - an aside / risk / note: a left-accent toned box.
 *   3. ```athena-figure   - an image (caption + alt) resolved from the org's
 *      attachment store by id. The renderer owns the pixels; the body only
 *      ever carries an opaque `athena-asset://<id>` reference (never bytes).
 *   4. ```athena-steps    - an ordered procedure as numbered rows.
 *   5. ```athena-quote    - a pull-quote / key takeaway.
 *   6. ```athena-chart    - a bar / line / area / pie chart from compact data.
 *
 * KEY INVARIANT: the model emits only compact STRUCTURE (a few lines per
 * block); every pixel of styling is owned by the renderer here. So a richer
 * document costs no extra generation tokens, and "too much colour" is
 * impossible to author - each renderer hardcodes its neutral token set.
 *
 * DEGRADATION: a block that parses to nothing useful renders null (the caller's
 * router falls back to an ordinary code block). No function throws.
 * tokens-only colours, WCAG AA (semantic `-soft` / `-ink` pairs; everything
 * else is neutral).
 */

import { useEffect, useState } from "react";
import { Info, AlertTriangle, ShieldAlert, CheckCircle2, ImageOff, type LucideIcon } from "lucide-react";

import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
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
 * lead line plus the stat chips, rendered either as inline pills (default) or
 * as a big-number tile band (`style: tiles`). Empty (no tldr, no chips) ->
 * render null so the caller degrades to a plain code block.
 */
export function SummaryCard({ source }: { source: string }) {
  const { attrs } = parseBlock(source);
  const tldr = attrs["tldr"]?.trim();
  const chips = parseChips(attrs["chips"]);
  if (!tldr && chips.length === 0) return null;
  const tiles = attrs["style"]?.trim().toLowerCase() === "tiles" && chips.length > 0;

  return (
    <Card data-testid="athena-summary" className="my-3">
      <Stack gap="3">
        {tldr && (
          <p className="text-sm font-medium leading-relaxed text-[var(--text)]">{tldr}</p>
        )}
        {chips.length > 0 && (tiles ? <ChipTiles chips={chips} /> : <ChipPills chips={chips} />)}
      </Stack>
    </Card>
  );
}

/** The default inline stat pills. */
function ChipPills({ chips }: { chips: Chip[] }) {
  return (
    <Cluster gap="2" align="center">
      {chips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-baseline gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs"
        >
          {chip.label && <span className="text-[var(--text-muted)]">{chip.label}</span>}
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
  );
}

/** `style: tiles` - the same chip data as a big-number band (value leads,
 *  muted label below). Neutral surface tiles, no colour. */
function ChipTiles({ chips }: { chips: Chip[] }) {
  return (
    <Grid cols="auto-fit-128" gap="2">
      {chips.map((chip, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
        >
          <div
            className={cn(
              "text-lg font-semibold text-[var(--text)]",
              NUMERIC_LEAD.test(chip.value) && "tabular-nums",
            )}
          >
            {chip.value}
          </div>
          {chip.label && (
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
              {chip.label}
            </div>
          )}
        </div>
      ))}
    </Grid>
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
 * This is the ONLY block that uses colour, and only for genuine semantics.
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

/* -------------------------------------------------------------------------- */
/* athena-figure - an image with caption, resolved from the attachment store  */
/* -------------------------------------------------------------------------- */

const ASSET_RE = /^athena-asset:\/\/(.+)$/;

/** The opaque attachment id inside an `athena-asset://<id>` ref, or null. The
 *  renderer ONLY ever accepts this scheme - an external URL is rejected (it
 *  would drop the bearer token and be CSP-blocked anyway), so the body can
 *  never point the page at an arbitrary host. */
function assetId(raw: string | undefined): string | null {
  const m = ASSET_RE.exec((raw ?? "").trim());
  return m ? (m[1] ?? "").trim() || null : null;
}

/** True when a figure block names a valid asset (else degrade to a code block). */
export function isRenderableFigure(source: string): boolean {
  return assetId(parseBlock(source).attrs["asset"]) !== null;
}

/** Fetch an attachment's bytes (auth'd) as a revocable object URL - the proven
 *  `message-attachments.tsx` pattern: the app uses Bearer tokens, so a raw
 *  `<img src>` to a presigned URL would be unauthenticated AND `img-src`
 *  CSP-blocked; a `blob:` URL is allowed. */
function useAttachmentBlob(id: string): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false;
    let obj: string | null = null;
    setUrl(null);
    setFailed(false);
    void api.attachments
      .blobUrl(id)
      .then((u) => {
        if (revoked) {
          URL.revokeObjectURL(u);
          return;
        }
        obj = u;
        setUrl(u);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [id]);
  return { url, failed };
}

/**
 * Figure - a captioned image. The body carries only `asset: athena-asset://<id>`
 * (+ optional `caption` / `alt`); the bytes are fetched with auth and rendered
 * via a `blob:` URL. A missing/failed asset degrades to a neutral placeholder,
 * never a blank screen. Neutral framing, no colour.
 */
export function Figure({ source }: { source: string }) {
  const { attrs } = parseBlock(source);
  const id = assetId(attrs["asset"]);
  const caption = attrs["caption"]?.trim();
  const alt = attrs["alt"]?.trim() || caption || "Figure";
  if (!id) return null;
  return <FigureImage id={id} alt={alt} caption={caption} />;
}

function FigureImage({ id, alt, caption }: { id: string; alt: string; caption?: string | undefined }) {
  const { url, failed } = useAttachmentBlob(id);
  return (
    <figure data-testid="athena-figure" className="my-4">
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
        {failed ? (
          <div className="flex items-center gap-2 px-3 py-6 text-xs text-[var(--text-muted)]">
            <ImageOff className="size-4 shrink-0" aria-hidden />
            Image unavailable
          </div>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element -- auth'd blob: figure
          <img src={url} alt={alt} className="mx-auto block max-h-[28rem] w-full object-contain" />
        ) : (
          <div className="h-40 w-full animate-pulse bg-[var(--surface-3)]" aria-hidden />
        )}
      </div>
      {caption && (
        <figcaption className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* athena-steps - an ordered procedure                                        */
/* -------------------------------------------------------------------------- */

/** One step per body line; a leading `1.` / `1)` / `-` / `*` marker is stripped
 *  so the model can write either a plain list or bare lines. */
function stepLines(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*])\s+/, "").trim())
    .filter(Boolean);
}

export function isRenderableSteps(source: string): boolean {
  return stepLines(parseBlock(source).body).length > 0;
}

/**
 * Steps - a numbered procedure as scannable rows: a neutral number badge plus
 * the step text. Beats a bare `1. 2. 3.` list by giving each step a clear
 * anchor. Monochrome, tokens-only.
 */
export function Steps({ source }: { source: string }) {
  const steps = stepLines(parseBlock(source).body);
  if (steps.length === 0) return null;
  return (
    <ol data-testid="athena-steps" className="my-3 flex flex-col gap-2.5">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold tabular-nums text-[var(--text-muted)]">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-[var(--text)]">
            <MarkdownLite source={step} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* athena-quote - a pull-quote / key takeaway                                 */
/* -------------------------------------------------------------------------- */

export function isRenderableQuote(source: string): boolean {
  return Boolean(parseBlock(source).body.trim());
}

/**
 * Quote - elevates one load-bearing sentence (a decision, a constraint, a
 * verdict) as a pull-quote. Larger measure, a left hairline rule, generous
 * margin; an optional `by:` attribution. Pure typography, zero colour.
 */
export function Quote({ source }: { source: string }) {
  const { attrs, body } = parseBlock(source);
  if (!body.trim()) return null;
  const by = attrs["by"]?.trim();
  return (
    <figure
      data-testid="athena-quote"
      className="my-4 border-l-2 border-[var(--border-strong)] pl-4"
    >
      <blockquote className="text-base leading-relaxed text-[var(--text)]">
        <MarkdownLite source={body} />
      </blockquote>
      {by && <figcaption className="mt-1.5 text-xs text-[var(--text-muted)]">{by}</figcaption>}
    </figure>
  );
}

/* -------------------------------------------------------------------------- */
/* athena-chart - a multi-format chart (bar / line / area / pie)              */
/* -------------------------------------------------------------------------- */

interface Datum {
  label: string;
  value: number;
}

type ChartType = "bar" | "line" | "area" | "pie";

/** One `Label: number` per body line. Values may carry thousands separators or
 *  a trailing unit; the leading number is taken. Non-numeric lines are skipped. */
const DATA_LINE = /^(.*?):\s+(.+)$/;
function parseSeries(body: string): Datum[] {
  const out: Datum[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = DATA_LINE.exec(line);
    if (!m) continue;
    const num = (m[2] ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!num) continue;
    const value = Number(num[0]);
    if (!Number.isFinite(value)) continue;
    out.push({ label: (m[1] ?? "").trim(), value });
  }
  return out;
}

function chartType(raw: string | undefined): ChartType {
  const t = (raw ?? "").trim().toLowerCase();
  return t === "line" || t === "area" || t === "pie" ? t : "bar";
}

const fmt = (v: number): string => v.toLocaleString();

export function isRenderableChart(source: string): boolean {
  return parseSeries(parseBlock(source).body).length > 0;
}

/**
 * Chart - a small, dependency-free data chart in one of four formats. The model
 * emits only `type:` + `Label: number` lines; this renderer owns the geometry,
 * so a chart costs a handful of tokens (far fewer than prose describing the same
 * numbers). A single accent (`--primary`) carries the data; everything else is
 * neutral. Degrades to a code block when no numeric data parses.
 */
export function Chart({ source }: { source: string }) {
  const { attrs, body } = parseBlock(source);
  const data = parseSeries(body);
  if (data.length === 0) return null;
  const type = chartType(attrs["type"]);
  const title = attrs["title"]?.trim();
  const label = `${title ? `${title}. ` : ""}${type} chart: ${data
    .map((d) => `${d.label} ${fmt(d.value)}`)
    .join(", ")}`;
  return (
    <figure
      data-testid="athena-chart"
      data-chart-type={type}
      className="my-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      {title && (
        <figcaption className="mb-3 text-sm font-semibold text-[var(--text)]">{title}</figcaption>
      )}
      {type === "bar" ? (
        <BarChart data={data} />
      ) : type === "pie" ? (
        <PieChart data={data} ariaLabel={label} />
      ) : (
        <LineAreaChart data={data} area={type === "area"} ariaLabel={label} />
      )}
    </figure>
  );
}

/** Horizontal bars - the most readable format for labelled categories. Built
 *  from divs (no SVG): a neutral track with a single-accent fill. */
function BarChart({ data }: { data: Datum[] }) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(0,8rem)_1fr_auto] items-center gap-3 text-xs"
        >
          <span className="truncate text-[var(--text-muted)]" title={d.label}>
            {d.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <span
              className="block h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${Math.max(2, (Math.max(0, d.value) / max) * 100)}%` }}
            />
          </span>
          <span className="tabular-nums text-[var(--text)]">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** A line (or filled area) chart over the data points. Geometry is computed;
 *  the line/fill use the single accent token. */
function LineAreaChart({
  data,
  area,
  ariaLabel,
}: {
  data: Datum[];
  area: boolean;
  ariaLabel: string;
}) {
  const W = 320;
  const H = 120;
  const pad = 10;
  const values = data.map((d) => d.value);
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const n = data.length;
  const x = (i: number): number => (n <= 1 ? W / 2 : pad + i * ((W - 2 * pad) / (n - 1)));
  const y = (v: number): number => H - pad - ((v - min) / range) * (H - 2 * pad);
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const areaPath =
    `M ${x(0).toFixed(1)} ${(H - pad).toFixed(1)} ` +
    data.map((d, i) => `L ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ") +
    ` L ${x(n - 1).toFixed(1)} ${(H - pad).toFixed(1)} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel}>
        {area && <path d={areaPath} className="fill-[var(--primary)] opacity-10" />}
        <polyline
          points={line}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-[var(--primary)]"
        />
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.value)} r={2.5} className="fill-[var(--primary)]" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span className="truncate">{data[0]?.label}</span>
        {n > 1 && <span className="truncate">{data[n - 1]?.label}</span>}
      </div>
    </div>
  );
}

/** A monochrome opacity ramp so a pie reads as one accent in shades, never a
 *  rainbow. Cycles for long series. */
const PIE_OPACITY = ["opacity-90", "opacity-70", "opacity-55", "opacity-40", "opacity-30"];
const pieShade = (i: number): string => PIE_OPACITY[i % PIE_OPACITY.length] ?? "opacity-90";

function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Pie - proportional slices in a single-accent opacity ramp, with a legend.
 *  A single 100% datum draws a full circle (avoids a degenerate arc). */
function PieChart({ data, ariaLabel }: { data: Datum[]; ariaLabel: string }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  const cx = 50;
  const cy = 50;
  const r = 46;
  let acc = 0;
  const slices = data.map((d) => {
    const frac = Math.max(0, d.value) / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const [x0, y0] = polar(cx, cy, r, a0);
    const [x1, y1] = polar(cx, cy, r, a1);
    const large = frac > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    return { path, frac, label: d.label };
  });
  const single = data.length === 1;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-28 shrink-0" role="img" aria-label={ariaLabel}>
        {single ? (
          <circle cx={cx} cy={cy} r={r} className="fill-[var(--primary)] opacity-90" />
        ) : (
          slices.map((s, i) => (
            <path key={i} d={s.path} className={cn("fill-[var(--primary)]", pieShade(i))} />
          ))
        )}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span
              className={cn("size-2.5 shrink-0 rounded-[2px] bg-[var(--primary)]", pieShade(i))}
              aria-hidden
            />
            <span className="truncate text-[var(--text)]" title={s.label}>
              {s.label}
            </span>
            <span className="ml-auto shrink-0 tabular-nums text-[var(--text-muted)]">
              {Math.round(s.frac * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
