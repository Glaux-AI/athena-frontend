"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Users,
  Globe,
  Building2,
  Bell,
  BellRing,
  CreditCard,
  Plug,
  Shield,
  KeyRound,
  ShieldCheck,
  User as UserIcon,
  UserCog,
  UsersRound,
  Cpu,
  Lock,
  BookOpen,
  Tag,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { Eyebrow } from "@/components/ui/eyebrow";
import { cn } from "@/lib/cn";
import { usePermissions } from "@/lib/session/use-permissions";

type NavGroup = "workspace" | "people" | "ai" | "user";

const NAV: {
  href: string;
  label: string;
  group: NavGroup;
  icon: LucideIcon;
  permission?: string;
}[] = [
  // Workspace
  { href: "/settings/organization", label: "Organization", group: "workspace", icon: Building2 },
  { href: "/settings/org-standards", label: "Org Standards", group: "workspace", icon: BookOpen },
  { href: "/settings/labels",       label: "Labels",       group: "workspace", icon: Tag },
  { href: "/settings/integrations", label: "Integrations", group: "workspace", icon: Plug },
  { href: "/settings/privacy",      label: "Privacy",      group: "workspace", icon: Lock },
  { href: "/settings/trash",        label: "Trash",        group: "workspace", icon: Trash2 },
  { href: "/settings/danger",       label: "Danger zone",  group: "workspace", icon: AlertTriangle },
  // People & access
  { href: "/settings/members",      label: "Members",      group: "people", icon: Users },
  { href: "/settings/teams",        label: "Teams",        group: "people", icon: UsersRound },
  { href: "/settings/roles",        label: "Roles & permissions", group: "people", icon: UserCog, permission: "roles:manage" },
  { href: "/settings/email-domains", label: "Email domains", group: "people", icon: Globe },
  { href: "/settings/sso",          label: "SSO + SCIM",   group: "people", icon: Shield },
  { href: "/settings/api-tokens",   label: "API tokens",   group: "people", icon: KeyRound },
  // AI & billing
  { href: "/settings/models",       label: "Model providers", group: "ai", icon: Cpu },
  { href: "/settings/billing",      label: "Billing",      group: "ai", icon: CreditCard },
  { href: "/settings/alerts",       label: "Budgets & alerts", group: "ai", icon: BellRing, permission: "notifications:read" },
  // User
  { href: "/settings/profile",      label: "Profile",       group: "user", icon: UserIcon },
  { href: "/settings/security",     label: "Security",      group: "user", icon: ShieldCheck },
  { href: "/settings/notifications", label: "Notifications", group: "user", icon: Bell },
];

const GROUPS: { id: NavGroup; title: string }[] = [
  { id: "workspace", title: "Workspace" },
  { id: "people",    title: "People & access" },
  { id: "ai",        title: "AI & billing" },
  { id: "user",      title: "You" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can } = usePermissions();
  const visible = NAV.filter((n) => n.permission == null || can(n.permission));

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="glass-chrome rounded-lg p-3 lg:sticky lg:top-6 lg:self-start">
        <Stack gap="4">
          {GROUPS.map((group) => (
            <Section key={group.id} title={group.title}>
              {visible.filter((n) => n.group === group.id).map((item) => (
                <NavItem key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
              ))}
            </Section>
          ))}
        </Stack>
      </aside>
      <main className="min-w-0">
        <Stack gap="6">{children}</Stack>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="1">
      <div className="px-2">
        <Eyebrow>{title}</Eyebrow>
        <hr className="hr-horizon mt-1" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </Stack>
  );
}

function NavItem({ item, active }: { item: { href: string; label: string; icon: LucideIcon }; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
