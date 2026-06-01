"use client";

/**
 * NodeDossierProvider — the single global entry point for the shared
 * node-dossier drawer (Phase D contract #1).
 *
 * Any node-id anywhere in the app opens the SAME drawer via
 * `useNodeDossier().open(nodeId)`. Because every ref inside a dossier is
 * itself a node-id, the drawer is self-navigating: clicking a ref pushes
 * onto an in-drawer history stack so Back returns to the previous node.
 *
 * Mounted once in `AppShell`, so the context is available to every
 * protected surface (org / cap / repo pages, graphs, blueprint tables,
 * Mermaid diagrams) without per-page wiring.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { NodeDossierDrawer } from "@/components/knowledge/node-dossier-drawer";

interface NodeDossierContextValue {
  /** Open the drawer on `nodeId` (resets the in-drawer history). */
  open: (nodeId: string) => void;
  /** The currently-open node id, or null when the drawer is closed. */
  activeNodeId: string | null;
}

const NodeDossierContext = createContext<NodeDossierContextValue | null>(null);

export function NodeDossierProvider({ children }: { children: ReactNode }) {
  // The drawer keeps its own back-stack so nested ref navigation has a
  // Back affordance; `stack[stack.length - 1]` is the visible node.
  const [stack, setStack] = useState<string[]>([]);

  const open = useCallback((nodeId: string) => {
    setStack([nodeId]);
  }, []);

  const push = useCallback((nodeId: string) => {
    setStack((prev) => (prev[prev.length - 1] === nodeId ? prev : [...prev, nodeId]));
  }, []);

  const back = useCallback(() => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  const close = useCallback(() => setStack([]), []);

  const activeNodeId = stack.length > 0 ? stack[stack.length - 1]! : null;

  const value = useMemo<NodeDossierContextValue>(() => ({ open, activeNodeId }), [open, activeNodeId]);

  return (
    <NodeDossierContext.Provider value={value}>
      {children}
      <NodeDossierDrawer
        nodeId={activeNodeId}
        canBack={stack.length > 1}
        onNavigate={push}
        onBack={back}
        onClose={close}
      />
    </NodeDossierContext.Provider>
  );
}

/** Open the shared node-dossier drawer from anywhere. Returns a no-op
 *  `open` when called outside the provider (e.g. unit tests that render a
 *  node-ref chip standalone) so call sites never need a null guard. */
export function useNodeDossier(): NodeDossierContextValue {
  const ctx = useContext(NodeDossierContext);
  if (!ctx) {
    return { open: () => {}, activeNodeId: null };
  }
  return ctx;
}
