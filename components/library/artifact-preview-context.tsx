"use client";

/**
 * ArtifactPreviewProvider - the app-wide "open an artifact from anywhere"
 * seam: `[artifact:DOC-42]` chat chips, cockpit display-id chips, and
 * save-to-library toasts all call `useArtifactPreview().open(ref)` and get
 * the same right-side ArtifactDrawer. Mounted once in AppShell (the
 * NodeDossierProvider precedent); the hook no-ops safely when unmounted so
 * shared components never crash outside the shell.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { ArtifactDrawer } from "@/components/library/artifact-drawer";

const ArtifactPreviewContext = createContext<{ open: (ref: string) => void }>({
  open: () => {},
});

export function useArtifactPreview(): { open: (ref: string) => void } {
  return useContext(ArtifactPreviewContext);
}

export function ArtifactPreviewProvider({ children }: { children: ReactNode }) {
  const [ref, setRef] = useState<string | null>(null);
  const open = useCallback((r: string) => setRef(r), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <ArtifactPreviewContext.Provider value={value}>
      {children}
      {ref && <ArtifactDrawer refId={ref} onClose={() => setRef(null)} onDeleted={() => setRef(null)} />}
    </ArtifactPreviewContext.Provider>
  );
}
