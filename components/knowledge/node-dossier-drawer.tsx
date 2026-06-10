"use client";

/**
 * NodeDossierDrawer — the shared, self-navigating node-dossier slide-over
 * (Phase D contract #1). Fetches `GET /v1/knowledge/nodes/{id}` and renders
 * the full dossier via `<NodeDossierBody>`: headline + what + architecture +
 * signals + contains + contained_by + typed relations + see-also. Every ref
 * inside is a clickable node-id (`<NodeRefChip>` / `<NodeRefRow>`) that
 * navigates within the drawer's own back-stack — so you can hop node → node
 * without losing place.
 *
 * Mounted once by `NodeDossierProvider`; opened by `useNodeDossier().open()`.
 * Mirrors `<FileDetailDrawer>` chrome: backdrop, Esc, focus-on-close,
 * prefers-reduced-motion slide-in. The dossier render itself lives in
 * `node-dossier-body.tsx` (shared with the topology explorer's inline panel).
 */

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { api, type NodeDossierResponse } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import {
  NodeDossierBody,
  isSelfBlueprint,
  resolveFileTarget,
  type FileTarget,
} from "@/components/knowledge/node-dossier-body";

interface NodeDossierDrawerProps {
  nodeId: string | null;
  canBack: boolean;
  onNavigate: (nodeId: string) => void;
  onBack: () => void;
  onClose: () => void;
  /** Returns true once for a freshly-opened node (top-level `open()`), so a
   *  leaf node auto-forwards to its file blueprint exactly once and Back doesn't
   *  bounce. Defaults to never-armed (standalone / test usage just renders). */
  consumeForwardArm?: (nodeId: string) => boolean;
}

export function NodeDossierDrawer({ nodeId, canBack, onNavigate, onBack, onClose, consumeForwardArm }: NodeDossierDrawerProps) {
  const [res, setRes] = useState<NodeDossierResponse | null>(null);
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const dossier = res?.dossier ?? null;

  // Esc to close.
  useEffect(() => {
    if (!nodeId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nodeId, onClose]);

  // Land focus on Close when the drawer opens.
  useEffect(() => { if (nodeId) closeRef.current?.focus(); }, [nodeId]);

  // Fetch the node whenever the visible node changes. A LEAF node (no blueprint
  // of its own) opened fresh auto-forwards to its home FILE's blueprint;
  // otherwise we render it (with a one-click "Open file blueprint" affordance
  // when a home file exists), so the drawer is never blank.
  useEffect(() => {
    if (!nodeId) { setRes(null); setFileTarget(null); setForwarding(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRes(null);
    setFileTarget(null);
    setForwarding(false);
    api.knowledge
      .node(nodeId)
      .then(async (r) => {
        if (cancelled) return;
        const armed = consumeForwardArm?.(nodeId) ?? false;
        const target = isSelfBlueprint(r) ? null : await resolveFileTarget(r);
        if (cancelled) return;
        if (target && armed) {
          // Push the file node → the drawer re-fetches + renders its blueprint;
          // the leaf stays on the back-stack so Back returns to it.
          setForwarding(true);
          onNavigate(target.node_id);
          return;
        }
        setRes(r);
        setFileTarget(target);
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load node"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [nodeId, consumeForwardArm, onNavigate]);

  if (!nodeId) return null;

  return (
    <div className="fixed inset-0 z-[60]" data-testid="node-dossier-drawer">
      <button
        type="button"
        aria-label="Close node detail"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)] backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in"
        data-testid="node-dossier-backdrop"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "glass absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col rounded-l-xl",
          "border-l border-[var(--border)] shadow-[var(--shadow-3)]",
          "motion-safe:animate-in motion-safe:slide-in-from-right",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent px-4 py-3 shadow-[var(--inner-highlight)]">
          <Cluster gap="2" align="center" className="min-w-0">
            {canBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to previous node"
                data-testid="node-dossier-back"
                className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
              </button>
            )}
            <Stack gap="0" className="min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {dossier?.kind ?? res?.node_kind ?? "Node"}
              </span>
              <span id={titleId} className="truncate text-sm font-semibold text-[var(--text)]" title={dossier?.name ?? res?.name ?? undefined}>
                {(loading || forwarding) && !dossier ? "Loading…" : dossier?.name ?? res?.name ?? "—"}
              </span>
            </Stack>
          </Cluster>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close node detail"
            className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          <NodeDossierBody
            res={res}
            fileTarget={fileTarget}
            loading={loading || forwarding}
            error={error}
            onNavigate={onNavigate}
          />
        </div>
      </aside>
    </div>
  );
}
