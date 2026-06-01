/**
 * A short, human-readable label for a citation — never a raw UUID or line range.
 *
 * For a path-style ref (what weaker models emit, e.g. `athena/billing/tier.py`)
 * we show the file basename; for an opaque id ref we show the citation kind word
 * (`source` / `decision` / `note` / …). Used by both the inline prose chips
 * (`chat-markdown`) and the "Sources" chips under each answer (`chat-message`).
 */

const KIND_WORD: Record<string, string> = {
  node: "source",
  convention: "decision",
  note: "note",
  past: "prior",
  file: "file",
  pr: "PR",
  symbol: "symbol",
  decision: "decision",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function prettyCitationLabel(kind: string, ref: string): string {
  const r = ref.replace(/:L\d+(?:-L?\d+)?$/, "").trim();
  if (r && !UUID_RE.test(r) && /[/.]/.test(r)) {
    const base = r.split("/").pop() || r;
    return base.length > 32 ? base.slice(0, 31) + "…" : base;
  }
  return KIND_WORD[kind] ?? "source";
}
