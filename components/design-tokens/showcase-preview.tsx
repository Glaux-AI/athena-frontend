"use client";

/**
 * The "preview by default" surface for a design system: a sandboxed iframe
 * rendering the showcase (palette + type + components, light + dark) built from
 * the system's own CSS. No scripts (sandbox=""), so it is inert and safe.
 *
 * The rebuild is DEBOUNCED (300 ms) so typing in the code / token editors does
 * not re-render the whole showcase document on every keystroke.
 */

import { useEffect, useMemo, useState } from "react";

import { parseCssTokens } from "@/lib/design/parse";
import { buildShowcaseHtml, type ShowcaseComponent } from "@/lib/design/showcase";
import { cn } from "@/lib/cn";

/** Trailing-edge debounce of a value. Shared by the design-tokens surfaces
 *  (showcase rebuild, import-dialog search). */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function ShowcasePreview({
  css,
  components = [],
  className,
}: {
  css: string;
  /** The system's components, rendered (inert) in the preview. */
  components?: ShowcaseComponent[];
  className?: string;
}) {
  const debouncedCss = useDebouncedValue(css, 300);
  const debouncedComponents = useDebouncedValue(components, 300);
  const html = useMemo(
    () => buildShowcaseHtml(debouncedCss, parseCssTokens(debouncedCss), debouncedComponents),
    [debouncedCss, debouncedComponents],
  );
  return (
    <iframe
      title="Design system preview"
      srcDoc={html}
      sandbox=""
      className={cn("h-[520px] w-full rounded-lg border border-[var(--border)]", className)}
    />
  );
}
