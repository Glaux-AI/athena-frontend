"use client";

// Desktop-only chrome grafted into the FE AppShell: the AI write-gate modal, the integrated
// terminal dock (toggled by Ctrl+`), and a floating worktree-status cluster. All of it renders
// only inside the Electron shell and only after mount, so the web (Vercel) build is untouched
// and there is no SSR/CSR hydration mismatch. The bottom dock overlays whatever surface you are
// on, like an IDE panel.

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { MenuCommand, Workspace } from "@/lib/desktop/types";
import { GateModal } from "@/components/desktop/gate-modal";
import { WorktreeStatusStrip } from "@/components/desktop/worktree-status-strip";
import { useDesktopDock } from "@/components/desktop/dock-context";

// xterm.js + the WebGL addon reference browser globals (`self`, `window`) at module load, so
// they must never be evaluated server-side. Loading the dock client-only keeps those modules out
// of the SSR graph entirely (otherwise SSR throws "self is not defined").
const TerminalDock = dynamic(
  () => import("@/components/desktop/terminal-dock").then((m) => m.TerminalDock),
  { ssr: false },
);

export function DesktopShellExtras() {
  const [mounted, setMounted] = useState(false);
  const [fontSize, setFontSize] = useState<number>(14);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const { visible, toggle, close } = useDesktopDock();
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  // Native application-menu items / accelerators push a MenuCommand; dispatch the ones the renderer
  // owns. Emergency Stop is handled in main directly (no menuCommand), so it is not listed here.
  useEffect(() => {
    if (!mounted || !isDesktop) return;
    const off = athena.app.onMenuCommand((cmd: MenuCommand) => {
      switch (cmd) {
        case "toggle-terminal":
          toggle();
          break;
        case "new-task":
          router.push("/work");
          break;
        case "settings":
          router.push("/settings");
          break;
        case "command-palette":
        case "emergency-stop":
          break;
      }
    });
    return off;
  }, [mounted, toggle, router]);

  // Resolve terminal font size from prefs + the active workspace for the status strip.
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    void (async () => {
      try {
        const prefs = await athena.app.getPrefs();
        if (alive && typeof prefs.terminalFontSize === "number") setFontSize(prefs.terminalFontSize);
      } catch {
        /* keep default */
      }
      try {
        const status = await athena.auth.status();
        const list: Workspace[] = await athena.workspace.list();
        const ws = (status.orgId ? list.find((w) => w.orgId === status.orgId) : list[0]) ?? list[0] ?? null;
        if (alive) setWorkspaceId(ws ? ws.id : null);
      } catch {
        if (alive) setWorkspaceId(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mounted]);

  // Ctrl+` (or Cmd+`) toggles the dock - captured so it works even when focus is inside
  // embedded content. The dock owns keystrokes once focused.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const isToggle = (e.ctrlKey || e.metaKey) && (e.key === "`" || e.code === "Backquote");
      if (!isToggle) return;
      e.preventDefault();
      toggle();
    },
    [toggle],
  );

  useEffect(() => {
    if (!mounted || !isDesktop) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onKey]);

  if (!mounted || !isDesktop) return null;

  return (
    <>
      {/* Floating worktree status, bottom-left. Hidden while the dock is open so they never
          overlap (the dock's own tabs show live worktree state anyway). */}
      {workspaceId && !visible ? (
        <div className="pointer-events-none fixed bottom-2 left-2 z-50 max-w-[60vw]">
          <div className="pointer-events-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]/95 px-2 py-1 shadow-[var(--shadow-2)] backdrop-blur">
            <WorktreeStatusStrip workspaceId={workspaceId} />
          </div>
        </div>
      ) : null}

      <TerminalDock visible={visible} onClose={close} fontSize={fontSize} />
      <GateModal />
    </>
  );
}
