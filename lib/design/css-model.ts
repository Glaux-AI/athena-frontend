/**
 * Structured token model over a design system's raw CSS.
 *
 * The Design tokens editor keeps the CSS STRING canonical; this module gives it
 * a safe structured view: `parseSystemCss` lifts the top-level `:root { ... }`
 * and `.dark { ... }` blocks into editable tokens (name / light value / dark
 * override / group) while EVERYTHING else (component rules, @media, comments
 * outside those two blocks) is preserved verbatim in `extraCss`.
 * `serializeSystemCss` re-emits the css with stable formatting (2-space indent,
 * one declaration per line).
 *
 * Safety contract:
 *   - parse(serialize(model)) deep-equals the model for any model produced by
 *     parsing well-formed css (round-trip stable);
 *   - css this module cannot fully account for (unbalanced braces, non-token
 *     declarations inside `:root`/`.dark`, comments inside those blocks,
 *     duplicate `:root` blocks, ...) is treated as malformed:
 *     `{ tokens: [], extraCss: css }` - the raw string is returned untouched
 *     so a structured edit can never destroy user css.
 */

export type TokenGroup =
  | "color"
  | "space"
  | "radius"
  | "type"
  | "shadow"
  | "border"
  | "other";

export interface EditableToken {
  /** Custom-property name including the leading `--`. */
  name: string;
  /** The `:root` value. Empty string only for a dark-only override. */
  light: string;
  /** The `.dark` override, or null when the token has none. */
  dark: string | null;
  group: TokenGroup;
}

export interface SystemCssModel {
  tokens: EditableToken[];
  /** All non-token css, preserved verbatim (trimmed at the ends). */
  extraCss: string;
}

const NAME_RE = /^--[\w-]+$/;
const DECL_RE = /^(--[\w-]+)\s*:\s*([^;{}]+)$/;
const LEN_RE = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|pt|ch)$/;
/** A value that IS a color (whole-value match, not "contains a color"). */
const COLOR_VALUE_RE =
  /^#[0-9a-fA-F]{3,8}$|^(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb|color)\(/i;
/** A color appearing anywhere inside a longer value (shadow detection). */
const COLOR_PART_RE = /#[0-9a-fA-F]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|hwb)\(/;

function isLength(value: string): boolean {
  return LEN_RE.test(value.trim());
}

/**
 * Bucket a token by name + value. Shadows are detected BEFORE colors (a value
 * with several lengths plus a color part is a shadow, not a color swatch), and
 * border widths before the generic px/rem space catch-all.
 */
export function classifyToken(name: string, value: string): TokenGroup {
  const n = name.toLowerCase();
  const v = value.trim();
  const lengths = v.match(/-?\d*\.?\d+(px|rem|em)\b/g) ?? [];
  if (n.includes("shadow") || (lengths.length >= 2 && COLOR_PART_RE.test(v))) return "shadow";
  if (/border(-[a-z]+)*-width/.test(n)) return "border";
  if (n.includes("radius") || n.includes("rounded")) return "radius";
  if (
    n.includes("font") ||
    n.includes("leading") ||
    n.includes("tracking") ||
    (n.includes("text") && isLength(v))
  ) {
    return "type";
  }
  if (COLOR_VALUE_RE.test(v)) return "color";
  if (isLength(v) || n.includes("space") || n.includes("gap") || n.includes("inset")) return "space";
  return "other";
}

interface TopLevelBlock {
  /** The selector text with any preceding statements stripped. */
  selector: string;
  /** Removal range start (start of the selector itself). */
  start: number;
  /** Removal range end (just past the closing brace). */
  end: number;
  body: string;
}

/**
 * Scan the css for top-level `selector { ... }` blocks. Returns null when the
 * braces don't balance (malformed). Nested braces (e.g. rules inside @media)
 * stay inside their outer block; comments are skipped.
 */
function scanTopLevelBlocks(css: string): TopLevelBlock[] | null {
  const blocks: TopLevelBlock[] = [];
  let depth = 0;
  let i = 0;
  let segStart = 0;
  let bodyStart = 0;
  let outerStart = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      const close = css.indexOf("*/", i + 2);
      if (close < 0) return null;
      i = close + 2;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        const prelude = css.slice(segStart, i);
        // Keep any earlier `;`-terminated statements (@import ...) out of the
        // block's removal range so they survive in extraCss.
        const lastSemi = prelude.lastIndexOf(";");
        let selStart = segStart + lastSemi + 1;
        // Skip leading whitespace + block comments so `/* x */ :root` is
        // recognized as `:root`, while the comment stays OUT of the removal
        // range (it survives in extraCss). A comment starting here always
        // closes before `i` - the outer loop would have skipped this `{`
        // otherwise.
        for (;;) {
          while (selStart < i && /\s/.test(css[selStart]!)) selStart++;
          if (css[selStart] === "/" && css[selStart + 1] === "*") {
            selStart = css.indexOf("*/", selStart + 2) + 2;
          } else {
            break;
          }
        }
        outerStart = selStart;
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth < 0) return null;
      if (depth === 0) {
        blocks.push({
          selector: css.slice(outerStart, bodyStart - 1).trim(),
          start: outerStart,
          end: i + 1,
          body: css.slice(bodyStart, i),
        });
        segStart = i + 1;
      }
    }
    i++;
  }
  return depth === 0 ? blocks : null;
}

/** Parse a `:root`/`.dark` body into ordered [name, value] pairs, or null when
 *  any statement is not a plain custom-property declaration. A body carrying a
 *  comment is unliftable too: a structured edit would re-serialize the block
 *  without it, silently deleting the annotation - fall back instead. */
function parseDeclarations(body: string): [string, string][] | null {
  if (body.includes("/*")) return null;
  const out: [string, string][] = [];
  for (const raw of body.split(";")) {
    const stmt = raw.trim();
    if (!stmt) continue;
    const m = DECL_RE.exec(stmt);
    if (!m) return null;
    out.push([m[1]!, m[2]!.trim()]);
  }
  return out;
}

const MALFORMED = (css: string): SystemCssModel => ({ tokens: [], extraCss: css });

export function parseSystemCss(css: string): SystemCssModel {
  const blocks = scanTopLevelBlocks(css);
  if (blocks === null) return MALFORMED(css);
  const rootBlocks = blocks.filter((b) => b.selector === ":root");
  const darkBlocks = blocks.filter((b) => b.selector === ".dark");
  if (rootBlocks.length > 1 || darkBlocks.length > 1) return MALFORMED(css);

  const rootDecls = rootBlocks[0] ? parseDeclarations(rootBlocks[0].body) : [];
  const darkDecls = darkBlocks[0] ? parseDeclarations(darkBlocks[0].body) : [];
  if (rootDecls === null || darkDecls === null) return MALFORMED(css);

  const tokens: EditableToken[] = [];
  const byName = new Map<string, EditableToken>();
  for (const [name, value] of rootDecls) {
    const existing = byName.get(name);
    if (existing) {
      // The LAST duplicate declaration wins, matching the css cascade.
      existing.light = value;
      existing.group = classifyToken(name, value);
      continue;
    }
    const token: EditableToken = { name, light: value, dark: null, group: classifyToken(name, value) };
    byName.set(name, token);
    tokens.push(token);
  }
  for (const [name, value] of darkDecls) {
    const existing = byName.get(name);
    if (existing) {
      // Last declaration wins here too (cascade); a dark-only token's group
      // follows its winning dark value.
      if (existing.light === "" && existing.dark !== null) {
        existing.group = classifyToken(name, value);
      }
      existing.dark = value;
      continue;
    }
    const token: EditableToken = { name, light: "", dark: value, group: classifyToken(name, value) };
    byName.set(name, token);
    tokens.push(token);
  }

  // Everything outside the two token blocks, verbatim.
  const removals = [...rootBlocks, ...darkBlocks].sort((a, b) => a.start - b.start);
  let extraCss = "";
  let cursor = 0;
  for (const b of removals) {
    extraCss += css.slice(cursor, b.start);
    cursor = b.end;
  }
  extraCss += css.slice(cursor);
  return { tokens, extraCss: extraCss.trim() };
}

export function serializeSystemCss(model: SystemCssModel): string {
  const valid = model.tokens.filter((t) => NAME_RE.test(t.name));
  const rootLines = valid
    .filter((t) => t.light.trim() !== "")
    .map((t) => `  ${t.name}: ${t.light.trim()};`);
  const darkLines = valid
    .filter((t) => t.dark !== null && t.dark.trim() !== "")
    .map((t) => `  ${t.name}: ${(t.dark as string).trim()};`);
  const parts: string[] = [`:root {\n${rootLines.join("\n")}${rootLines.length ? "\n" : ""}}`];
  if (darkLines.length > 0) parts.push(`.dark {\n${darkLines.join("\n")}\n}`);
  const extra = model.extraCss.trim();
  if (extra) parts.push(extra);
  return `${parts.join("\n\n")}\n`;
}
