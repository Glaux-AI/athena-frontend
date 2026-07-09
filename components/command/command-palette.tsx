"use client";

/**
 * CommandPalette - the global ⌘K search + jump-to palette.
 *
 * The single global search surface: fuzzy-search across every navigable
 * destination (every page + every Settings sub-page) and every live entity in
 * the workspace - tasks, domains, repositories, skills, and MCP servers -
 * then jump straight there. The TopBar "Search" button and the ⌘K / Ctrl-K
 * shortcut both open it.
 *
 * Knowledge-graph search (semantic / lexical retrieval over the KG) is a
 * separate surface - it lives on the /knowledge page's explorer, not here.
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
  Plus, SquareCheck, Layers, Network, Zap,
  ScrollText, FileCheck2, Gavel, FolderGit2, Server, Home, Bell, Building2,
  CreditCard, Cpu, User, EyeOff, Trash2, AlertTriangle,
  Inbox as InboxIcon, Activity as ActivityIcon, MessageCircle, Settings,
  CircleDollarSign, ShieldCheck, Plug, Key, Lock, Users, Globe, Search,
  type LucideIcon,
} from "lucide-react";

import {
  api,
  type Domain, type Skill, type Task, type RepoFull, type McpServer,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

interface Destination { icon: LucideIcon; label: string; href: string; keywords?: string[] }

/** Every top-level page, fuzzy-searchable as a jump target. `keywords` add
 *  synonyms so a page is findable by what users actually type. */
const PAGES: Destination[] = [
  { icon: Home,             label: "Home",                href: "/dashboard",          keywords: ["dashboard", "overview"] },
  { icon: MessageCircle,    label: "Chat",                href: "/chat",               keywords: ["ask", "assistant", "sophia"] },
  { icon: InboxIcon,        label: "Inbox",               href: "/inbox",              keywords: ["notifications", "messages"] },
  { icon: ActivityIcon,     label: "Activity",            href: "/activity",           keywords: ["feed", "history", "audit"] },
  { icon: SquareCheck,      label: "Tasks",               href: "/work",               keywords: ["runs", "jobs", "kanban", "board"] },
  { icon: Layers,           label: "Domains",        href: "/domains",       keywords: ["caps"] },
  { icon: Network,          label: "Org knowledge",       href: "/knowledge",          keywords: ["kg", "topology", "graph", "explorer"] },
  { icon: FileCheck2,       label: "Blueprint approvals", href: "/blueprint-proposals", keywords: ["proposals", "review"] },
  { icon: Gavel,            label: "Rules",               href: "/rules",              keywords: ["decisions", "adr", "conventions"] },
  { icon: Zap,              label: "Skills",              href: "/skills",             keywords: ["agents"] },
  { icon: Server,           label: "MCP servers",         href: "/mcp",                keywords: ["tools", "model context protocol"] },
  { icon: CircleDollarSign, label: "Cost",                href: "/cost",               keywords: ["spend", "usage", "budget"] },
  { icon: Settings,         label: "Settings",            href: "/settings",           keywords: ["preferences", "config"] },
];

/** Every Settings sub-page, fuzzy-searchable as a jump target. */
const SETTINGS_PAGES: Destination[] = [
  { icon: User,          label: "Profile",       href: "/settings/profile",       keywords: ["account", "name", "avatar"] },
  { icon: Building2,     label: "Organization",  href: "/settings/organization",  keywords: ["org", "workspace"] },
  { icon: Users,         label: "Members",       href: "/settings/members",       keywords: ["team", "people", "users", "seats"] },
  { icon: CreditCard,    label: "Billing",       href: "/settings/billing",       keywords: ["plan", "subscription", "invoice", "payment", "credit"] },
  { icon: Cpu,           label: "AI models",     href: "/settings/models",        keywords: ["routing", "llm", "providers", "byok", "keys"] },
  { icon: Plug,          label: "Integrations",  href: "/settings/integrations",  keywords: ["github", "connect", "apps"] },
  { icon: Bell,          label: "Notifications", href: "/settings/notifications", keywords: ["alerts", "email"] },
  { icon: ShieldCheck,   label: "SSO + SCIM",    href: "/settings/sso",           keywords: ["saml", "oidc", "login", "identity"] },
  { icon: Lock,          label: "Security",      href: "/settings/security",      keywords: ["password", "2fa", "sessions"] },
  { icon: EyeOff,        label: "Privacy",       href: "/settings/privacy",       keywords: ["data", "retention", "gdpr"] },
  { icon: Key,           label: "API tokens",    href: "/settings/api-tokens",    keywords: ["keys", "pat", "developer"] },
  { icon: Globe,         label: "Email domains", href: "/settings/email-domains", keywords: ["dns", "verify", "email"] },
  { icon: ScrollText,    label: "Org standards", href: "/settings/org-standards", keywords: ["conventions", "guidelines"] },
  { icon: Trash2,        label: "Trash",         href: "/settings/trash",         keywords: ["deleted", "restore", "recycle"] },
  { icon: AlertTriangle, label: "Danger zone",   href: "/settings/danger",        keywords: ["delete org", "destroy"] },
];

/** Per-group DOM cap. Generous enough that every entity stays searchable
 *  (cmdk only filters what's rendered) while bounding the node count. */
const MAX_PER_GROUP = 50;

const HEADING_CLASS = "text-[10px] uppercase tracking-wider text-[var(--text-subtle)]";

/** Strict, predictable matcher (replaces cmdk's loose subsequence scorer): an
 *  item matches only when EVERY whitespace-separated term in the query is a
 *  substring of its visible text + `keywords`. Kills the noise short queries
 *  produced with the default scorer, still searches the deep keyword fields
 *  (descriptions, full task goals, page synonyms), and is a trivial O(n) scan. */
function searchFilter(value: string, search: string, keywords?: string[]): number {
  const hay = `${value} ${keywords?.join(" ") ?? ""}`.toLowerCase();
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t)) ? 1 : 0;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  // Server-searched task hits for the current query (title/display-id ILIKE) -
  // typed queries search the WHOLE org, not just the recent page below.
  const [taskHits, setTaskHits] = useState<Task[] | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [repos, setRepos] = useState<RepoFull[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘K / Ctrl-K opens the global search palette. Plain K (no Shift) - the
      // knowledge-graph search lives on the /knowledge page, not here.
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (tasks.length || domains.length || skills.length || repos.length || mcpServers.length) return;
    void Promise.all([
      // A small recent slice, not the whole org - typed queries hit the
      // server search below instead.
      api.tasks.list({ limit: 30, sort: "-updated" }).then(setTasks).catch(() => {}),
      api.domains.list().then(setDomains).catch(() => {}),
      api.skills.list().then(setSkills).catch(() => {}),
      api.repos.list().then(setRepos).catch(() => {}),
      api.mcp.list().then(setMcpServers).catch(() => {}),
    ]);
  }, [open, tasks.length, domains.length, skills.length, repos.length, mcpServers.length]);

  // Debounced org-wide task search ("FEAT-12" or any title fragment). Falls
  // back to the recent slice when the query clears; soft-fails to it on error.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setTaskHits(null);
      return;
    }
    const t = setTimeout(() => {
      api.tasks
        .list({ q, limit: 20, sort: "-updated" })
        .then(setTaskHits)
        .catch(() => setTaskHits(null));
    }, 200);
    return () => clearTimeout(t);
  }, [open, query]);

  const go = useCallback((path: string) => {
    setOpen(false);
    router.push(path);
  }, [router]);

  // Repos are only viewable through a domain route, so drop any with no
  // attached domain (there's no detail page to jump to).
  const navigableRepos = repos.filter((r) => r.attached_domain_ids.length > 0);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="glass fixed left-1/2 top-[15%] z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-xl shadow-[var(--shadow-3)]"
      overlayClassName="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm"
    >
      <DialogPrimitive.Title className="sr-only">Search Athena</DialogPrimitive.Title>
      <DialogPrimitive.Description className="sr-only">
        Search tasks, domains, repositories, skills, MCP servers, settings, and jump to any page in the workspace.
      </DialogPrimitive.Description>
      <CmdkCommand label="Search Athena" filter={searchFilter} loop>
        <div className="flex items-center border-b border-[var(--border)] px-3">
          <Search className="size-4 text-[var(--text-muted)]" />
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Search tasks, domains, repos, skills, settings…"
            className="flex-1 border-0 bg-transparent px-3 py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">esc</kbd>
        </div>
        <CommandList className="max-h-[60vh] overflow-y-auto px-1 py-2 text-sm">
          <CommandEmpty className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">No results.</CommandEmpty>

          <CommandGroup heading="Quick actions" className={HEADING_CLASS}>
            <Item icon={<Plus className="size-3.5" />} label="Start a new task" onSelect={() => go("/work")} />
            <Item icon={<InboxIcon className="size-3.5" />} label="Open Inbox" onSelect={() => go("/inbox")} />
            <Item icon={<CircleDollarSign className="size-3.5" />} label="Open Cost" onSelect={() => go("/cost")} />
            <Item icon={<Settings className="size-3.5" />} label="Open Settings" onSelect={() => go("/settings")} />
          </CommandGroup>
          <CommandSeparator className="my-1 h-px bg-[var(--border)]" />

          {(taskHits ?? tasks).length > 0 && (
            <>
              <CommandGroup heading="Tasks" className={HEADING_CLASS}>
                {(taskHits ?? tasks).slice(0, MAX_PER_GROUP).map((t) => (
                  <Item key={t.id} icon={<SquareCheck className="size-3.5" />} label={t.title} hint={t.display_id} keywords={[t.display_id, t.title, t.type, t.status].filter(Boolean)} onSelect={() => go(`/work/${t.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          {domains.length > 0 && (
            <>
              <CommandGroup heading="Domains" className={HEADING_CLASS}>
                {domains.slice(0, MAX_PER_GROUP).map((c) => (
                  <Item key={c.id} icon={<Layers className="size-3.5" />} label={c.name} hint={`/${c.slug}`} keywords={c.description ? [c.description] : []} onSelect={() => go(`/domains/${c.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          {navigableRepos.length > 0 && (
            <>
              <CommandGroup heading="Repositories" className={HEADING_CLASS}>
                {navigableRepos.slice(0, MAX_PER_GROUP).map((r) => (
                  <Item key={r.id} icon={<FolderGit2 className="size-3.5" />} label={r.full_name} hint={r.default_branch} onSelect={() => go(`/domains/${r.attached_domain_ids[0]}/repos/${r.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          {skills.length > 0 && (
            <>
              <CommandGroup heading="Skills" className={HEADING_CLASS}>
                {skills.slice(0, MAX_PER_GROUP).map((s) => (
                  <Item key={s.id} icon={<Zap className="size-3.5" />} label={s.name} hint={s.slug} keywords={[s.description ?? "", ...(s.phases ?? [])].filter(Boolean)} onSelect={() => go(`/skills/${s.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          {mcpServers.length > 0 && (
            <>
              <CommandGroup heading="MCP servers" className={HEADING_CLASS}>
                {mcpServers.slice(0, MAX_PER_GROUP).map((s) => (
                  <Item key={s.id} icon={<Server className="size-3.5" />} label={s.name} hint={s.slug} onSelect={() => go(`/mcp/${s.id}`)} />
                ))}
              </CommandGroup>
              <CommandSeparator className="my-1 h-px bg-[var(--border)]" />
            </>
          )}

          <CommandGroup heading="Navigate" className={HEADING_CLASS}>
            {PAGES.map((p) => {
              const Icon = p.icon;
              return <Item key={p.href} icon={<Icon className="size-3.5" />} label={p.label} keywords={p.keywords ?? []} onSelect={() => go(p.href)} />;
            })}
          </CommandGroup>
          <CommandSeparator className="my-1 h-px bg-[var(--border)]" />

          <CommandGroup heading="Settings" className={HEADING_CLASS}>
            {SETTINGS_PAGES.map((p) => {
              const Icon = p.icon;
              return <Item key={p.href} icon={<Icon className="size-3.5" />} label={p.label} keywords={p.keywords ?? []} onSelect={() => go(p.href)} />;
            })}
          </CommandGroup>
        </CommandList>
      </CmdkCommand>
    </CommandDialog>
  );
}

function Item({ icon, label, hint, onSelect, disabled, keywords }: { icon: React.ReactNode; label: string; hint?: string; onSelect: () => void; disabled?: boolean; keywords?: string[] }) {
  return (
    <CommandItem
      onSelect={onSelect}
      disabled={disabled ?? false}
      // Deepen matching beyond the visible label/hint - searched, not shown.
      keywords={keywords ?? []}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm aria-selected:bg-[var(--primary-soft)] aria-selected:text-[var(--primary)]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span className="flex items-center gap-2 truncate">
        <span className="text-[var(--text-muted)]">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {hint && <span className="shrink-0 font-mono text-[10px] text-[var(--text-subtle)]">{hint}</span>}
    </CommandItem>
  );
}
