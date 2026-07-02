"use client";

/**
 * Template gallery - the first screen of the "New design system" flow. A grid
 * of curated starter templates (live mini previews built from each template's
 * own css) plus a Blank card. Picking one seeds a fresh, fully-editable draft
 * in the editor; templates are starting points, never locked.
 */

import { useMemo } from "react";
import { FilePlus2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Cluster, Grid, Stack } from "@/components/layout/primitives";
import { parseCssTokens } from "@/lib/design/parse";
import { buildShowcaseHtml } from "@/lib/design/showcase";
import { DESIGN_TEMPLATES, type DesignTemplate } from "@/lib/design/templates";

export function TemplateGallery({
  onPick,
}: {
  /** A template to seed the draft from, or null for a blank draft. */
  onPick: (template: DesignTemplate | null) => void;
}) {
  const previews = useMemo(
    () =>
      new Map(
        DESIGN_TEMPLATES.map((t) => [
          t.id,
          buildShowcaseHtml(t.css, parseCssTokens(t.css), t.components),
        ]),
      ),
    [],
  );

  return (
    <Stack gap="3">
      <Stack gap="0.5">
        <h2 className="text-base font-semibold text-[var(--text)]">Start from a template</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Every template is a complete, editable starting point - tokens and
          components alike. Pick one, then make it yours.
        </p>
      </Stack>
      <Grid cols="auto-fit-240" gap="3">
        {DESIGN_TEMPLATES.map((t) => (
          <Card key={t.id} className="flex flex-col gap-2.5 p-3">
            <iframe
              title={`${t.name} preview`}
              srcDoc={previews.get(t.id)}
              sandbox=""
              tabIndex={-1}
              className="pointer-events-none h-40 w-full shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface)]"
            />
            <Stack gap="0.5" className="min-h-0 flex-1">
              <span className="text-sm font-semibold text-[var(--text)]">{t.name}</span>
              <p className="text-xs text-[var(--text-muted)]">{t.description}</p>
            </Stack>
            <Button size="sm" variant="secondary" onClick={() => onPick(t)}>
              Use this template
            </Button>
          </Card>
        ))}
        <Card className="flex flex-col gap-2.5 p-3">
          <div
            className="flex h-40 w-full shrink-0 items-center justify-center rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)]"
            aria-hidden
          >
            <FilePlus2 className="size-6 text-[var(--text-subtle)]" />
          </div>
          <Stack gap="0.5" className="min-h-0 flex-1">
            <span className="text-sm font-semibold text-[var(--text)]">Blank</span>
            <p className="text-xs text-[var(--text-muted)]">
              Start from nothing - write the css yourself or generate it with AI.
            </p>
          </Stack>
          <Button size="sm" variant="secondary" onClick={() => onPick(null)}>
            Start blank
          </Button>
        </Card>
      </Grid>
      <Cluster gap="1" align="center">
        <span className="text-[11px] text-[var(--text-subtle)]">
          Prefer your own brand? Pick any template, then use the editor&apos;s
          Build-from-existing-code action to pull the tokens already in your repos.
        </span>
      </Cluster>
    </Stack>
  );
}
