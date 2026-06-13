/**
 * Edition normalisation - see F-01.1 in athena-backend/docs/execution-plans/frontend-fixes.md.
 *
 * The backend is mid-rename from `team`/`business` → `pro`. Until the rename
 * completes everywhere, the FE accepts the legacy values from `Org.edition`
 * (a free-form `string` on the wire) and maps them to the closed FE union
 * `solo | pro | enterprise`. Unknown values fall back to `solo` with a
 * console warning so the violation surfaces during dev / preview.
 */

type EditionValue = "solo" | "pro" | "enterprise";

const EDITION_LABEL: Record<EditionValue, string> = {
  solo: "Solo",
  pro: "Pro",
  enterprise: "Enterprise",
};

/** Map any string (including legacy `team` / `business`) to the FE union. */
export function normalizeEdition(raw: string): EditionValue {
  if (raw === "solo" || raw === "pro" || raw === "enterprise") return raw;
  if (raw === "team" || raw === "business") return "pro";
  console.warn("[edition] Unknown value, defaulting to solo:", raw);
  return "solo";
}

/** Display label for an edition value. */
export function editionLabel(e: EditionValue): string {
  return EDITION_LABEL[e];
}
