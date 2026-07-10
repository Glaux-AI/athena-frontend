/**
 * The ONE focus-ring grammar (Nightglass foundation). Interactive elements
 * import this instead of retyping ring classes - keeps offset/color drift out.
 * Text inputs use the accent-glow focus instead (see INPUT_FOCUS).
 */

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

/** Accent-glow focus for text fields - the same light the agent emits. */
export const inputFocus =
  "focus:outline-none focus:border-[var(--border-accent)] focus:shadow-[0_0_0_3px_var(--glow-accent)]";
