/**
 * AppShell — the only authenticated-layout in v1. See UX standard §6.
 * TopBar + Sidebar + main content + global Cmd-K palette.
 */

import { type ReactNode } from "react";

import { TopBar } from "@/components/layout/top-bar";
import { SidebarNav } from "@/components/layout/sidebar";
import { Sidebar as SidebarPrimitive } from "@/components/layout/primitives";
import { CommandPalette } from "@/components/command/command-palette";
import { ChatDrawer } from "@/components/chat/chat-drawer";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--bg)]">
      <TopBar />
      <SidebarPrimitive
        sideWidth="240px"
        side={<SidebarNav />}
        main={<div className="mx-auto w-full max-w-screen-2xl px-6 py-8 lg:px-8">{children}</div>}
      />
      <CommandPalette />
      <ChatDrawer />
    </div>
  );
}
