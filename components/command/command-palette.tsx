"use client";

/**
 * CommandPalette — Cmd-K / Ctrl-K search across the workspace.
 *
 * Searches tasks, capabilities, skills, integrations, decision records, and
 * provides quick actions ("Start a new task", "Open Settings → SSO", …).
 *
 * Built on `cmdk` for keyboard-first UX. Lives in the TopBar so it's available
 * everywhere; opening is global via the listener mounted here.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Command as CmdkCommand,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import {
  Plus, FileText, Hammer, SquareCheck, Layers, Network, Zap, ScrollText,
  Inbox as InboxIcon, Activity as ActivityIcon, MessageCircle, Settings, CircleDollarSign,
  ShieldCheck, Plug, Key, Lock, Users, Globe, Search,
} from "lucide-react";

import { api, type Capability, type Skill, type Run } from "@/lib/api/client";
import { useChatDrawerStore } from "@/lib/stores/chat-drawer";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<Run[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (tasks.length || capabilities.length || skills.length) return;
    void Promise.all([
      api.runs.list().then(setTasks).catch(() => {}),
      api.capabilities.list().then(setCapabilities).catch(() => {}),
      api.skills.list().then(setSkills).catch(() => {}),
    ]);
  }, [open, tasks.length, capabilities.length, skills.length]);

  const go = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  const openChatDrawer = useCallback(() => {
    setOpen(false);
    useChatDrawerStore.getState().setOpen(true);
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[15%] z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
      overlayClassName="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm"
    >
      <DialogPrimitive.Title className="sr-only">Search Athena</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Search tasks, capabilities, skills, settings, and jump to any page in the workspace.
      </DialogPrimitive.Description>
      <CmdkCommand label="Search Athena" loop>
        <div className="flex items-center border-b border-[var(--border)] px-3">
          <Search className="size-4 text-[var(--text-muted)]" />
          <CommandInput
            placeholder="Search tasks, capabilities, skills, settings…"
            className="flex-1 border-0 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">esc</kbd>
        </div>
        <CommandList className="max-h-[60vh] overflow-y-auto px-1 py-2 text-sm">
          <CommandEmpty className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No results.</CommandEmpty>

          <CommandGroup heading="Quick actions" className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            <Item icon={<Plus className="size-3.5" />} label="Start a new task" hint="N" onSelect={() => { setOpen(false); document.dispatchEvent(new CustomEvent("athena:new-task")); }} />
            <Item icon={<InboxIcon className="size-3.5" />} label="Open Inbox" onSelect={() => go("/inbox")} />
            <Item icon={<CircleDollarSign className="size-3.5" />} label="Open Cost" onSelect={() => go("/cost")} />
            <Item icon={<Settings className="size-3.5" />} label="Open Settings" onSelect={() => go("/settings")} />
          </CommandGroup>
          <CommandSeparator className="my-1 h-px bg-[var(--border)]" />

          {tasks.length > 0 && (
            <>
              <CommandGroup heading="Tasks" className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                {tasks.slice(0, 8).map((t) => (
                  <Item key={t.id} icon={t.intent === "generate_prd" ? <FileText className="size-3.5" /> : <Hammer className="size-3.5" />} label={t.goal.split("\n")[0]!} hint={t.id} onSelect={() => go(`/runs/${t.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          {capabilities.length > 0 && (
            <>
              <CommandGroup heading="Capabilities" className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                {capabilities.map((c) => (
                  <Item key={c.id} icon={<Layers className="size-3.5" />} label={c.name} hint={`/${c.slug}`} onSelect={() => go(`/capabilities/${c.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          {skills.length > 0 && (
            <>
              <CommandGroup heading="Skills" className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
                {skills.slice(0, 6).map((s) => (
                  <Item key={s.id} icon={<Zap className="size-3.5" />} label={s.name} hint={s.slug} onSelect={() => go(`/skills/${s.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          <CommandGroup heading="Navigate" className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            <Item icon={<SquareCheck className="size-3.5" />}     label="Tasks"            onSelect={() => go("/runs")} />
            <Item icon={<MessageCircle className="size-3.5" />}    label="Open chat drawer" hint="⌘." onSelect={openChatDrawer} />
            <Item icon={<ActivityIcon className="size-3.5" />}     label="Activity"         onSelect={() => go("/activity")} />
            <Item icon={<Layers className="size-3.5" />}           label="Capabilities"     onSelect={() => go("/capabilities")} />
            <Item icon={<Network className="size-3.5" />}          label="Knowledge graph"  onSelect={() => go("/knowledge")} />
            <Item icon={<ScrollText className="size-3.5" />}       label="Decision records" onSelect={() => go("/rules")} />
            <Item icon={<Zap className="size-3.5" />}              label="Skills"           onSelect={() => go("/skills")} />
            <Item icon={<CircleDollarSign className="size-3.5" />} label="Cost"             onSelect={() => go("/cost")} />
          </CommandGroup>
          <CommandSeparator className="my-1 h-px bg-[var(--border)]" />

          <CommandGroup heading="Settings" className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">
            <Item icon={<Users className="size-3.5" />}      label="Members"        onSelect={() => go("/settings/members")} />
            <Item icon={<Plug className="size-3.5" />}       label="Integrations"   onSelect={() => go("/settings/integrations")} />
            <Item icon={<ShieldCheck className="size-3.5" />}label="SSO + SCIM"     onSelect={() => go("/settings/sso")} />
            <Item icon={<Lock className="size-3.5" />}       label="Privacy"        onSelect={() => go("/settings/privacy")} />
            <Item icon={<Key className="size-3.5" />}        label="API tokens"     onSelect={() => go("/settings/api-tokens")} />
            <Item icon={<ScrollText className="size-3.5" />} label="Audit log"      onSelect={() => go("/settings/audit")} />
            <Item icon={<Globe className="size-3.5" />}      label="Domains"        onSelect={() => go("/settings/domains")} />
          </CommandGroup>
        </CommandList>
      </CmdkCommand>
    </CommandDialog>
  );
}

function Item({ icon, label, hint, onSelect }: { icon: React.ReactNode; label: string; hint?: string; onSelect: () => void }) {
  return (
    <CommandItem
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-[var(--primary-soft)] aria-selected:text-[var(--primary)]"
    >
      <span className="flex items-center gap-2 truncate">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {hint && <span className="shrink-0 font-mono text-[10px] text-[var(--text-subtle)]">{hint}</span>}
    </CommandItem>
  );
}
