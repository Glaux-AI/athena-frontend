"use client";

/**
 * ProviderFallbackPopover — body of the provider-fallback transparency
 * surface (readiness §3.1 row 812). Lists the LLM routing trail for a run
 * so the user can see exactly which model answered each call and which
 * fallback hops LiteLLM took.
 *
 * Rendered as the popover body owned by `<ProviderFallbackPill>`. The
 * project does not ship a `<table>` UI primitive — we use a plain
 * `<table>` with the same token-driven Tailwind classes that
 * `DevModeBadge` uses for its rollup table.
 */

import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/utils/format";

import type { ProviderRoute } from "@/hooks/use-fallback-info";

interface ProviderFallbackPopoverProps {
  routes: ProviderRoute[];
}

export function ProviderFallbackPopover({ routes }: ProviderFallbackPopoverProps) {
  if (routes.length === 0) {
    return (
      <p
        className="text-xs text-[var(--text-muted)]"
        data-testid="provider-fallback-empty"
      >
        No provider routing data for this run yet.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold">Provider routing trail</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        Each LLM call is routed by LiteLLM. Fallback hops are highlighted —
        these answers came from the secondary model after the primary route
        failed.
      </p>
      <table className="mt-3 w-full text-xs" data-testid="provider-fallback-table">
        <thead>
          <tr className="text-[var(--text-subtle)]">
            <th className="py-1 text-left font-medium">Model</th>
            <th className="py-1 text-left font-medium">Role</th>
            <th className="py-1 text-right font-medium">Calls</th>
            <th className="py-1 text-left font-medium">Fallback from</th>
            <th className="py-1 text-right font-medium">Last activity</th>
          </tr>
        </thead>
        <tbody className="text-[var(--text-muted)]">
          {routes.map((route, i) => (
            <RouteRow key={`${route.model}-${i}`} route={route} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RouteRow({ route }: { route: ProviderRoute }) {
  const isPrimary = route.primary;
  return (
    <tr
      className={cn(
        "border-t border-[var(--border)]",
        isPrimary ? "" : "bg-[var(--warning-soft)]",
      )}
      data-testid="provider-fallback-row"
      data-role={isPrimary ? "primary" : "fallback"}
    >
      <td className="py-1 font-mono text-[11px] text-[var(--text)]">
        {route.model}
      </td>
      <td className="py-1">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            isPrimary
              ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
              : "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
          )}
        >
          {isPrimary ? "Primary" : "Fallback"}
        </span>
      </td>
      <td className="py-1 text-right font-mono tabular-nums text-[var(--text)]">
        {route.calls}
      </td>
      <td className="py-1 font-mono text-[11px]">
        {route.fallback_from ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-[var(--text-subtle)]">{route.fallback_from}</span>
            <ArrowRight
              className="size-2.5 text-[var(--text-subtle)]"
              aria-hidden
            />
          </span>
        ) : (
          <span className="text-[var(--text-subtle)]">—</span>
        )}
      </td>
      <td className="py-1 text-right">{formatRelativeTime(route.ts)}</td>
    </tr>
  );
}
