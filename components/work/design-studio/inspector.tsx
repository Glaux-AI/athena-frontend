"use client";

/**
 * Read-grade Inspector (the Pro disclosure): the picked element's tag/selector
 * and its current resolved color/space/type values, each labeled with the
 * matching token from the ORG's own set when one is recognized (so the surface
 * reads as "on YOUR tokens", not raw values, and never Athena's). Read-only -
 * editing happens through the Tier-1 knobs and the AI bar.
 */

import { Crosshair } from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { matchToken } from "@/lib/design/tokens";
import type { DesignToken } from "@/lib/api/client";

import type { PickedNode } from "./editor-bridge";

export function Inspector({
  picked,
  colors,
}: {
  picked: PickedNode | null;
  colors: DesignToken[];
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2.5 py-1.5 text-micro font-medium uppercase tracking-wider text-[var(--text-subtle)]">
        <Crosshair className="size-3.5 text-[var(--primary)]" aria-hidden />
        Inspector
      </div>
      {!picked ? (
        <p className="px-2.5 py-2 text-xs text-[var(--text-muted)]">
          Select an element to inspect its tokens.
        </p>
      ) : (
        <Stack gap="2" className="px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono text-[var(--primary)]">{`<${picked.tag}>`}</span>
            {picked.text && <span className="truncate text-[var(--text-muted)]">{picked.text}</span>}
          </div>
          <ColorRow label="Text" value={picked.styles.color} colors={colors} />
          <ColorRow label="Background" value={picked.styles.background} colors={colors} />
          <ValueRow label="Font size" value={picked.styles.fontSize} />
          <ValueRow label="Padding" value={picked.styles.padding} />
          <ValueRow label="Radius" value={picked.styles.borderRadius} />
        </Stack>
      )}
    </div>
  );
}

function ColorRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: DesignToken[];
}) {
  const match = matchToken(value, colors);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[var(--text-subtle)]">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          style={{ ["--swatch" as string]: value || "transparent" }}
          className="size-3.5 rounded-full border border-[var(--border-strong)] bg-[var(--swatch)]"
        />
        <span className="font-mono text-[var(--text)]">{match ? match.name : shorten(value)}</span>
      </span>
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-[var(--text-subtle)]">{label}</span>
      <span className="font-mono text-[var(--text)]">{shorten(value)}</span>
    </div>
  );
}

function shorten(value: string): string {
  const v = (value || "").trim();
  return v.length > 22 ? `${v.slice(0, 22)}…` : v || "n/a";
}
