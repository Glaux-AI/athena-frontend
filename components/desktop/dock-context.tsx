"use client";

// Shared open/closed state for the integrated terminal dock.
//
// The dock can be toggled from three places: the Ctrl+` global shortcut, the active-task
// switcher's "Open scratch terminal" action, and the dock's own close button. A tiny context
// (mounted in AppShell, above both the TopBar and the dock) keeps them in agreement. On the
// web build the provider is a passthrough - nothing reads it because no desktop surface mounts.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface DockApi {
  visible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const DockContext = createContext<DockApi | null>(null);

export function DesktopDockProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const toggle = useCallback(() => setVisible((v) => !v), []);
  const value = useMemo<DockApi>(() => ({ visible, open, close, toggle }), [visible, open, close, toggle]);
  return <DockContext.Provider value={value}>{children}</DockContext.Provider>;
}

/** Read the dock controls. Safe no-op API when no provider is mounted (web build). */
export function useDesktopDock(): DockApi {
  const ctx = useContext(DockContext);
  return (
    ctx ?? {
      visible: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    }
  );
}
