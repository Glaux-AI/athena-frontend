import type { BlueprintStatus } from "@/lib/api/client";

const _INTERVAL_MS = 3000;
const _MAX_TRIES = 60; // ~3 min ceiling

/**
 * Poll a blueprint's status until it leaves `building`.
 *
 * The per-section Regenerate runs the agentic explorer asynchronously for
 * flagship sections (architecture / overview / portfolio): the endpoint
 * flips the blueprint to `building` and a worker rewrites the section, then
 * settles it back to `ready`. Callers await this between the regenerate
 * POST and their refresh so the new content is in place before they refetch.
 *
 * Returns immediately when the status is already terminal - the synchronous
 * single-shot path (every non-flagship section) never enters `building`, so
 * this is a no-op there.
 */
export async function pollBlueprintReady(
  getStatus: () => Promise<BlueprintStatus>,
): Promise<void> {
  for (let i = 0; i < _MAX_TRIES; i++) {
    let status: BlueprintStatus;
    try {
      status = await getStatus();
    } catch {
      return; // transient fetch error - stop politely; the next refresh recovers
    }
    if (status !== "building") return;
    await new Promise((resolve) => setTimeout(resolve, _INTERVAL_MS));
  }
}
