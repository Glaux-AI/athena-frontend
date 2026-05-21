"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Send,
  Globe,
  Building2,
  Plug,
  Shield,
  KeyRound,
  ScrollText,
  User as UserIcon,
} from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

const NAV: { href: string; label: string; section: "org" | "user"; icon: typeof Users }[] = [
  // Organization
  { href: "/settings/organization", label: "Organization", section: "org", icon: Building2 },
  { href: "/settings/members", label: "Members", section: "org", icon: Users },
  { href: "/settings/invitations", label: "Invitations", section: "org", icon: Send },
  { href: "/settings/domains", label: "Domains", section: "org", icon: Globe },
  { href: "/settings/integrations", label: "Integrations", section: "org", icon: Plug },
  { href: "/settings/sso", label: "SSO + SCIM", section: "org", icon: Shield },
  { href: "/settings/api-tokens", label: "API tokens", section: "org", icon: KeyRound },
  { href: "/settings/audit", label: "Audit log", section: "org", icon: ScrollText },
  // User
  { href: "/settings/profile", label: "Profile", section: "user", icon: UserIcon },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
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
      <Stack gap="0.5">{children}</Stack>
    </Stack>
  );
}

function NavItem({
  item,
  active,
}: {
  item: { href: string; label: string; icon: typeof Users };
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
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
