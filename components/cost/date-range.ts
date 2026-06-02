/**
 * Date-range model for the /cost dashboard's global time control.
 *
 * One source of truth for the page's window: the header picker emits a
 * `CostRange`, the page threads it into `api.cost.summary({ from, to, … })`
 * and into the per-model trend (`rangeDays`). Presets compute inclusive
 * `from`/`to` ISO dates (YYYY-MM-DD) from "today"; `custom` carries
 * user-picked endpoints verbatim.
 *
 * Pure + dependency-free (no date library — UX standard §15 forbids new deps).
 */

export type PresetKey =
  | "this_month"
  | "last_month"
  | "last_7d"
  | "last_30d"
  | "last_90d"
  | "last_12m"
  | "custom";

export interface CostRange {
  from: string; // inclusive ISO date (YYYY-MM-DD)
  to: string; // inclusive ISO date (YYYY-MM-DD)
  label: string; // human label for the header ("Last 30 days")
  preset: PresetKey;
}

/** Local-calendar YYYY-MM-DD (no UTC shift — the picker shows local days). */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/** Inclusive day count of a range — drives the per-model trend's `days` window. */
export function rangeDays(range: { from: string; to: string }): number {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

export const PRESETS: { key: Exclude<PresetKey, "custom">; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_7d", label: "Last 7 days" },
  { key: "last_30d", label: "Last 30 days" },
  { key: "last_90d", label: "Last 90 days" },
  { key: "last_12m", label: "Last 12 months" },
];

/** Resolve a preset to a concrete `CostRange` relative to `today`. */
export function resolvePreset(key: Exclude<PresetKey, "custom">, today = new Date()): CostRange {
  const label = PRESETS.find((p) => p.key === key)!.label;
  switch (key) {
    case "this_month":
      return { from: toISO(new Date(today.getFullYear(), today.getMonth(), 1)), to: toISO(today), label, preset: key };
    case "last_month": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toISO(first), to: toISO(last), label, preset: key };
    }
    case "last_7d":
      return { from: toISO(addDays(today, -6)), to: toISO(today), label, preset: key };
    case "last_30d":
      return { from: toISO(addDays(today, -29)), to: toISO(today), label, preset: key };
    case "last_90d":
      return { from: toISO(addDays(today, -89)), to: toISO(today), label, preset: key };
    case "last_12m":
      return { from: toISO(new Date(today.getFullYear(), today.getMonth() - 11, 1)), to: toISO(today), label, preset: key };
  }
}

/** Page default — a trailing 30-day window (always populated, billing-cycle agnostic). */
export function defaultRange(today = new Date()): CostRange {
  return resolvePreset("last_30d", today);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Pretty endpoint label, e.g. "Apr 3 – May 2, 2026" (year dropped when same as today). */
export function formatRangeSpan(range: { from: string; to: string }): string {
  const f = new Date(`${range.from}T00:00:00`);
  const t = new Date(`${range.to}T00:00:00`);
  const sameYear = f.getFullYear() === t.getFullYear();
  const fy = sameYear ? "" : `, ${f.getFullYear()}`;
  return `${MONTHS[f.getMonth()]} ${f.getDate()}${fy} – ${MONTHS[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`;
}

/** Build a custom range from two ISO endpoints (ordered defensively). */
export function customRange(from: string, to: string): CostRange {
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { from: a, to: b, label: "Custom range", preset: "custom" };
}
