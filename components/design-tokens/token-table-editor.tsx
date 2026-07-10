"use client";

/**
 * Structured token editor - the Tokens tab of the design-system editor. Renders
 * the parsed `EditableToken[]` grouped by kind (colors / type / spacing / ...),
 * with inline name + light + dark editing, per-group "Add token", per-row
 * delete, and a name search. Pure controlled component: every edit emits
 * `onChange(tokens)`; the parent serializes back to the canonical css string
 * via `lib/design/css-model`.
 */

import { useMemo, useState } from "react";
import { Moon, Plus, Search, Trash2, X } from "lucide-react";

import { Cluster, Stack } from "@/components/layout/primitives";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing, inputFocus } from "@/components/ui/focus";
import { type EditableToken, type TokenGroup } from "@/lib/design/css-model";
import { cn } from "@/lib/cn";

const GROUP_ORDER: TokenGroup[] = ["color", "type", "space", "radius", "border", "shadow", "other"];

const GROUP_LABEL: Record<TokenGroup, string> = {
  color: "Colors",
  type: "Typography",
  space: "Spacing",
  radius: "Radii",
  border: "Borders",
  shadow: "Shadows",
  other: "Other",
};

/** Sensible name prefix per group for the "Add token" affordance. */
const ADD_PREFIX: Record<TokenGroup, string> = {
  color: "--color-new",
  type: "--font-size-new",
  space: "--space-new",
  radius: "--radius-new",
  border: "--border-width-new",
  shadow: "--shadow-new",
  other: "--token-new",
};

const ADD_VALUE: Record<TokenGroup, string> = {
  color: "#888888",
  type: "1rem",
  space: "1rem",
  radius: "8px",
  border: "1px",
  shadow: "0 1px 2px rgba(0, 0, 0, 0.12)",
  other: "0",
};

const FIELD = cn(
  "rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-[border-color,box-shadow] duration-150",
  inputFocus,
);

const SIMPLE_HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function toSixDigitHex(v: string): string {
  const hex = v.trim();
  if (hex.length === 7) return hex.toLowerCase();
  // #abc -> #aabbcc
  const [r, g, b] = [hex[1]!, hex[2]!, hex[3]!];
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
}

/** Keep serialized css well-formed no matter what is typed: values must not
 *  carry `;` or braces, names only word chars + dashes. */
const sanitizeValue = (v: string) => v.replace(/[;{}]/g, "");
const sanitizeName = (v: string) => v.replace(/[^\w-]/g, "");

export function TokenTableEditor({
  tokens,
  onChange,
}: {
  tokens: EditableToken[];
  onChange: (next: EditableToken[]) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  // Indices into the FULL array, grouped for display - edits address the
  // original positions so filtering never scrambles the emitted order.
  const grouped = useMemo(() => {
    const map = new Map<TokenGroup, number[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    tokens.forEach((t, i) => {
      if (q && !t.name.toLowerCase().includes(q)) return;
      map.get(t.group)?.push(i);
    });
    return map;
  }, [tokens, q]);

  const update = (index: number, patch: Partial<EditableToken>) =>
    onChange(tokens.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  const remove = (index: number) => onChange(tokens.filter((_, i) => i !== index));

  const add = (group: TokenGroup) => {
    const base = ADD_PREFIX[group];
    let name = base;
    let n = 2;
    while (tokens.some((t) => t.name === name)) name = `${base}-${n++}`;
    onChange([...tokens, { name, light: ADD_VALUE[group], dark: null, group }]);
    // An active search would hide the new row (its name rarely matches the
    // query) - clear it so the added token is immediately visible.
    setQuery("");
  };

  return (
    <Stack gap="3">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-subtle)]"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tokens by name"
          aria-label="Search tokens"
          className={cn(
            "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-8 pr-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-[border-color,box-shadow] duration-150",
            inputFocus,
          )}
        />
      </label>

      {GROUP_ORDER.map((group) => {
        const indices = grouped.get(group) ?? [];
        if (q && indices.length === 0) return null;
        return (
          <Stack key={group} gap="1.5">
            <Cluster justify="between" align="center">
              <Eyebrow>
                {GROUP_LABEL[group]}
                <span className="ml-1.5 tabular-nums">{indices.length}</span>
              </Eyebrow>
              <button
                type="button"
                onClick={() => add(group)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-micro font-medium text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]",
                  focusRing,
                )}
                aria-label={`Add ${GROUP_LABEL[group].toLowerCase()} token`}
              >
                <Plus className="size-3" aria-hidden />
                Add token
              </button>
            </Cluster>
            {indices.length === 0 ? (
              <p className="rounded-md border border-dashed border-[var(--border)] px-2.5 py-1.5 text-micro text-[var(--text-subtle)]">
                No {GROUP_LABEL[group].toLowerCase()} tokens yet.
              </p>
            ) : (
              <Stack gap="1" as="ul">
                {indices.map((i) => (
                  <TokenRow
                    key={i}
                    token={tokens[i]!}
                    onPatch={(patch) => update(i, patch)}
                    onRemove={() => remove(i)}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

function TokenRow({
  token,
  onPatch,
  onRemove,
}: {
  token: EditableToken;
  onPatch: (patch: Partial<EditableToken>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5">
      <Cluster gap="2" align="center" className="flex-nowrap">
        <span className="shrink-0 font-mono text-xs text-[var(--text-subtle)]" aria-hidden>
          --
        </span>
        <input
          value={token.name.replace(/^--/, "")}
          onChange={(e) => onPatch({ name: `--${sanitizeName(e.target.value)}` })}
          aria-label={`${token.name} name`}
          spellCheck={false}
          className={cn(FIELD, "-ml-1.5 w-40 min-w-0 flex-1 border-transparent bg-transparent")}
        />
        <ValueInput
          value={token.light}
          color={token.group === "color"}
          ariaLabel={`${token.name} light value`}
          onValue={(v) => onPatch({ light: v })}
        />
        {token.dark === null ? (
          <button
            type="button"
            onClick={() => onPatch({ dark: token.light })}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-micro text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
              focusRing,
            )}
            aria-label={`Add dark value for ${token.name}`}
          >
            <Moon className="size-3" aria-hidden />
            dark
          </button>
        ) : (
          <Cluster gap="1" align="center" className="flex-nowrap">
            <Moon className="size-3 shrink-0 text-[var(--text-subtle)]" aria-hidden />
            <ValueInput
              value={token.dark}
              color={token.group === "color"}
              ariaLabel={`${token.name} dark value`}
              onValue={(v) => onPatch({ dark: v })}
            />
            <button
              type="button"
              onClick={() => onPatch({ dark: null })}
              aria-label={`Remove dark value for ${token.name}`}
              className={cn(
                "rounded-md p-0.5 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
                focusRing,
              )}
            >
              <X className="size-3" aria-hidden />
            </button>
          </Cluster>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${token.name}`}
          className={cn(
            "ml-auto shrink-0 rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]",
            focusRing,
          )}
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </Cluster>
    </li>
  );
}

/**
 * A single value cell. Color tokens show a swatch (painting whatever css color
 * the value is, oklch included) and, for plain 3/6-digit hex, a native color
 * picker; everything stays editable as monospace text.
 */
function ValueInput({
  value,
  color,
  ariaLabel,
  onValue,
}: {
  value: string;
  color: boolean;
  ariaLabel: string;
  onValue: (v: string) => void;
}) {
  const isHex = color && SIMPLE_HEX_RE.test(value.trim());
  return (
    <Cluster gap="1" align="center" className="flex-nowrap">
      {color && (
        <span
          className="size-4 shrink-0 rounded border border-[var(--border)]"
          // Dynamic user data, not theming: the swatch paints the token's own value.
          style={{ background: value }}
          aria-hidden
        />
      )}
      {isHex && (
        <input
          type="color"
          value={toSixDigitHex(value)}
          onChange={(e) => onValue(e.target.value)}
          aria-label={`${ariaLabel} color picker`}
          className="size-5 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
        />
      )}
      <input
        value={value}
        onChange={(e) => onValue(sanitizeValue(e.target.value))}
        aria-label={ariaLabel}
        spellCheck={false}
        className={cn(FIELD, "w-36 min-w-0")}
      />
    </Cluster>
  );
}
