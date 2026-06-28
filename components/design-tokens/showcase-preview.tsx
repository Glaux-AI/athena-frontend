"use client";

/**
 * The "preview by default" surface for a design system: a sandboxed iframe
 * rendering the showcase (palette + type + components, light + dark) built from
 * the system's own CSS. No scripts (sandbox=""), so it is inert and safe.
 */

import { useMemo } from "react";

import { parseCssTokens } from "@/lib/design/parse";
import { buildShowcaseHtml, type ShowcaseComponent } from "@/lib/design/showcase";

export function ShowcasePreview({
  css,
  components = [],
}: {
  css: string;
  /** The system's components, rendered (inert) in the preview. */
  components?: ShowcaseComponent[];
}) {
  const html = useMemo(
    () => buildShowcaseHtml(css, parseCssTokens(css), components),
    [css, components],
  );
  return (
    <iframe
      title="Design system preview"
      srcDoc={html}
      sandbox=""
      className="h-[520px] w-full rounded-lg border border-[var(--border)] bg-white"
    />
  );
}
