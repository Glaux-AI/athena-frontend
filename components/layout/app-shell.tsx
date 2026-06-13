/**
 * AppShell - the only authenticated-layout in v1. See UX standard §6.
 * TopBar + (§7.10 credit halt banner) + Sidebar + main content + global ⌘K
 * command palette (search / jump-to anything across the app).
 */

import { type ReactNode } from "react";

import { TopBar } from "@/components/layout/top-bar";
import { SidebarNav } from "@/components/layout/sidebar";
import { Sidebar as SidebarPrimitive } from "@/components/layout/primitives";
import { CommandPalette } from "@/components/command/command-palette";
import { CreditHaltBanner } from "@/components/billing/credit-halt-banner";
import { BuySeatsModalHost } from "@/components/billing/buy-seats-modal";
import { NodeDossierProvider } from "@/components/knowledge/node-dossier-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--bg)]">
      <TopBar />
      <CreditHaltBanner />
      {/* Phase D - the shared node-dossier drawer wraps every protected
          surface so any node-id anywhere can open it (contract #1). */}
      <NodeDossierProvider>
        <SidebarPrimitive
          sideWidth="240px"
          side={<SidebarNav />}
          main={<div className="mx-auto w-full max-w-screen-2xl px-6 py-8 lg:px-8">{children}</div>}
        />
      </NodeDossierProvider>
      <CommandPalette />
      <BuySeatsModalHost />
    </div>
  );
}
