/**
 * lastRequestedChange - the note from the most recent "request changes" on a
 * stage's hard gate (`"{stage_key}_signoff"`).
 *
 * A gate reject returns the stage to `ready` (not `rejected`), so without this
 * the user's words vanish from the cockpit. The work page feeds the result to
 * StageComposer, which shows it as a read-only "Changes requested" note - it is
 * NOT re-sent on the next run (the backend folds the gate feedback into the
 * brief itself; re-sending it as a steer is what used to double-post it).
 */

import type { ThreadEntry } from "@/lib/api/client";

export function lastRequestedChange(
  entries: ThreadEntry[],
  stageKey: string | null | undefined,
): string | null {
  if (!stageKey) return null;
  const gateKey = `${stageKey}_signoff`;
  // Newest matching rejection wins - entries are ordered ascending by seq.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && e.kind === "rejection" && e.gate_key === gateKey && e.body?.trim()) {
      return e.body.trim();
    }
  }
  return null;
}
