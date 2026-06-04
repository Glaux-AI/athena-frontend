"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Users,
  Globe,
  Building2,
  Bell,
  CreditCard,
  Plug,
  Shield,
  KeyRound,
  ShieldCheck,
  User as UserIcon,
  Cpu,
  Lock,
  BookOpen,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

const NAV: { href: string; label: string; section: "org" | "user"; icon: LucideIcon }[] = [
  // Organization
  { href: "/settings/organization", label: "Organization", section: "org", icon: Building2 },
  { href: "/settings/org-standards", label: "Org Standards", section: "org", icon: BookOpen },
  { href: "/settings/members",      label: "Members",      section: "org", icon: Users },
  { href: "/settings/domains",      label: "Domains",      section: "org", icon: Globe },
  { href: "/settings/integrations", label: "Integrations", section: "org", icon: Plug },
  { href: "/settings/sso",          label: "SSO + SCIM",   section: "org", icon: Shield },
  { href: "/settings/models",       label: "Model providers", section: "org", icon: Cpu },
  { href: "/settings/privacy",      label: "Privacy",      section: "org", icon: Lock },
  { href: "/settings/api-tokens",   label: "API tokens",   section: "org", icon: KeyRound },
  { href: "/settings/billing",      label: "Billing",      section: "org", icon: CreditCard },
  { href: "/settings/trash",        label: "Trash",        section: "org", icon: Trash2 },
  { href: "/settings/danger",       label: "Danger zone",  section: "org", icon: AlertTriangle },
  // User
  { href: "/settings/profile",      label: "Profile",       section: "user", icon: UserIcon },
  { href: "/settings/security",     label: "Security",      section: "user", icon: ShieldCheck },
  { href: "/settings/notifications", label: "Notifications", section: "user", icon: Bell },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[var(--shadow-1)] lg:sticky lg:top-6 lg:self-start">
        <Stack gap="4">
          <Section title="Organization">
            {NAV.filter((n) => n.section === "org").map((item) => (
              <NavItem key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
            ))}
          </Section>
          <Section title="You">
            {NAV.filter((n) => n.section === "user").map((item) => (
              <NavItem key={item.href} item={item} active={pathname === item.href || pathname.startsWith(item.href + "/")} />
            ))}
          </Section>
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
      <h2 className="px-2 text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">{title}</h2>
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
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--primary-soft)] font-medium text-[var(--primary)] shadow-[var(--inner-highlight)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}
