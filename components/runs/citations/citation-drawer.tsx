"use client";

/**
 * CitationDrawer - side drawer that resolves a citation `ref` into the
 * underlying knowledge-graph node body or repo file slice. One drawer
 * instance per renderer root (the chips share it); open / close is
 * controlled by the parent.
 *
 * Mirrors the `ScopeCollisionsModal` overlay pattern (backdrop + Card
 * stack) but slides in from the right and closes on Esc / backdrop
 * click (not a sticky modal - read-only side viewer).
 *
 * Resolution is best-effort: we try `/v1/citations/resolve?source=…&ref=…`
 * first; on 404 / network error we fall back to rendering the raw `ref`
 * with a "view on source" link. The fetcher uses the project's standard
 * `apiFetch` wrapper so credentials + active-org headers ride along.
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, X } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing } from "@/components/ui/focus";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster } from "@/components/layout/primitives";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/cn";

import type { CitationSource } from "./citation-chip";

interface CitationDrawerProps {
  open: boolean;
  source: CitationSource | null;
  refValue: string | null;
  /** Human label from the chip that opened the drawer (e.g. "auth.py",
   *  "decision"). Shown as the header title so an unresolved citation never
   *  leads with a raw UUID; the raw ref stays visible underneath. */
  label?: string | null;
  onClose: () => void;
}

interface ResolvedCitation {
  title: string;
  body: string;
  source_url?: string | null;
  language?: string | null;
}

export function CitationDrawer({ open, source, refValue, label, onClose }: CitationDrawerProps) {
  const [resolved, setResolved] = useState<ResolvedCitation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resolveFailed, setResolveFailed] = useState(false);

  // Esc-to-close - only bound while open so we don't compete with other
  // overlays on the page.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Resolve on open. Skips when source/ref are not set (drawer is closed
  // from outside but the parent still mounts the component).
  useEffect(() => {
    if (!open || !source || !refValue) {
      setResolved(null);
      setResolveFailed(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setResolved(null);
    setResolveFailed(false);
    (async () => {
      try {
        const result = await apiFetch<ResolvedCitation>(
          `/v1/citations/resolve?source=${encodeURIComponent(source)}&ref=${encodeURIComponent(refValue)}`,
        );
        if (!cancelled) setResolved(result);
      } catch {
        // 404 / network error - fall back to the literal-ref view; the
        // empty-state copy already covers the user-facing message.
        if (!cancelled) setResolveFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, source, refValue]);

  const externalUrl = useCallback(() => {
    if (resolved?.source_url) return resolved.source_url;
    if (!source || !refValue) return null;
    // Only actual `repo://…` refs are URL-shaped after the scheme. Chat maps
    // file/pr citations to the repo source with arbitrary refs (paths, ids) -
    // fabricating `https://<ref>` from those gives a dead link.
    if (source === "repo" && refValue.startsWith("repo://")) {
      return `https://${refValue.replace(/^repo:\/\//, "")}`;
    }
    return null;
  }, [resolved, source, refValue]);

  if (!open || !source || !refValue) return null;

  const sourceUrl = externalUrl();

  return (
    <div
      className="fixed inset-0 z-[var(--z-drawer)]"
      role="dialog"
      aria-label="Citation source"
      aria-modal="true"
      data-testid="citation-drawer"
    >
      <button
        type="button"
        aria-label="Close citation drawer"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm animate-in fade-in"
        data-testid="citation-drawer-backdrop"
      />
      <aside
        className={cn(
          "glass-sheet absolute right-0 top-0 flex h-full w-full max-w-[520px] flex-col",
          "rounded-none border-y-0 border-r-0 border-l border-[var(--border)]",
          "animate-in slide-in-from-right",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-4 py-3">
          <Stack gap="0" className="min-w-0">
            <Eyebrow>
              {source === "kn" ? "Knowledge graph" : "Repository"}
            </Eyebrow>
            {label && label !== refValue && (
              <span className="truncate text-sm font-semibold text-[var(--text)]">{label}</span>
            )}
            <code
              className={cn(
                "truncate font-mono text-xs",
                label && label !== refValue ? "text-[var(--text-subtle)]" : "text-[var(--text)]",
              )}
            >
              {refValue}
            </code>
          </Stack>
          <Cluster gap="1" align="center">
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]", focusRing)}
              >
                <ExternalLink className="size-3.5" />
                View on source
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close citation drawer"
              className={cn("rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]", focusRing)}
            >
              <X className="size-4" />
            </button>
          </Cluster>
        </header>
        <hr className="hr-horizon" aria-hidden />
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <Stack gap="2" aria-busy="true">
              <Skeleton className="h-3 w-1/2 rounded-md" />
              <Skeleton className="h-32 w-full rounded-md" />
            </Stack>
          ) : resolved ? (
            <Stack gap="3">
              <h3 className="text-sm font-semibold">{resolved.title}</h3>
              <pre className={cn(
                "overflow-x-auto rounded-md bg-[var(--code-bg)] p-3 font-mono text-xs leading-relaxed",
                "whitespace-pre-wrap",
              )}>
                {resolved.body}
              </pre>
            </Stack>
          ) : (
            <Card className="border-[var(--border-strong)] bg-[var(--surface-2)]">
              <Stack gap="2">
                <span className="text-sm font-semibold">
                  Source preview unavailable
                </span>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  {resolveFailed
                    ? "This source isn't in the knowledge graph right now - it may not be indexed yet, or the cited snapshot was replaced by a newer sync of the repo."
                    : "No preview body for this citation."}
                </p>
                <Eyebrow>
                  Raw reference
                </Eyebrow>
                <code className="overflow-x-auto rounded-md bg-[var(--code-bg)] p-2 font-mono text-micro">
                  {refValue}
                </code>
              </Stack>
            </Card>
          )}
        </div>
      </aside>
    </div>
  );
}
