/**
 * AppShell - the only authenticated-layout in v1. See UX standard §6.
 * TopBar + (§7.10 credit halt banner) + Sidebar + main content + global ⌘K
 * command palette (search / jump-to anything across the app).
 */

import { type ReactNode } from "react";

import { TopBar } from "@/components/layout/top-bar";
import { SidebarNav } from "@/components/layout/sidebar";
import { Sidebar as SidebarPrimitive } from "@/components/layout/primitives";
import {
  MobileNavProvider,
  MobileSidebar,
} from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/command/command-palette";
import { CreditHaltBanner } from "@/components/billing/credit-halt-banner";
import { BuySeatsModalHost } from "@/components/billing/buy-seats-modal";
import { NodeDossierProvider } from "@/components/knowledge/node-dossier-context";
import { DesktopDockProvider } from "@/components/desktop/dock-context";
import { DesktopShellExtras } from "@/components/desktop/desktop-shell-extras";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    // MobileNavProvider wraps TopBar (the hamburger) and the body (the
    // off-canvas drawer) so the two share one open/closed state.
    // DesktopDockProvider shares the integrated-terminal dock's open/closed
    // state across the TopBar switcher, the Ctrl+` shortcut, and the dock
    // itself (desktop build only; a no-op passthrough on the web).
    <MobileNavProvider>
      <DesktopDockProvider>
      <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--bg)]">
        <TopBar />
        <CreditHaltBanner />
        {/* Phase D - the shared node-dossier drawer wraps every protected
            surface so any node-id anywhere can open it (contract #1). */}
        <NodeDossierProvider>
          {/* Desktop aside is hidden below lg; the mobile drawer below
              takes over there. */}
          <SidebarPrimitive
            sideWidth="240px"
            sideClassName="hidden lg:block"
            side={<SidebarNav />}
            main={
              <div className="mx-auto w-full max-w-screen-2xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
                {children}
              </div>
            }
          />
        </NodeDossierProvider>
        <MobileSidebar />
        <CommandPalette />
        <BuySeatsModalHost />
        {/* Desktop-only: AI write-gate modal + integrated terminal dock +
            floating worktree status. Renders nothing on the web build. */}
        <DesktopShellExtras />
      </div>
      </DesktopDockProvider>
    </MobileNavProvider>
  );
}
