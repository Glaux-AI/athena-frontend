/**
 * ScopeTabs — universal tab nav for Org / Capability / Repo surfaces.
 *
 * Per ADR-073 §1, every scope renders the same five-tab base (Blueprint /
 * Topology / Decisions / Activity / Operations) plus scope-specific extras.
 * The tab list is computed from the scope so the shell is teachable in one
 * sentence: "Every scope has the same first five tabs; specifics differ at
 * the right."
 *
 * Tab → tab-content mapping is the caller's responsibility (a switch on
 * the active key); this component is purely the nav strip.
 */

import { cn } from "@/lib/cn";

type ScopeKind = "org" | "capability" | "repo";

/** Universal tab keys used across all scopes. */
type UniversalTab = "blueprint" | "topology" | "decisions" | "activity" | "operations";

/** Scope-specific extra tabs. */
type CapabilityExtraTab = "knowledge" | "repos" | "sources" | "notes" | "tasks" | "members" | "config" | "danger";
type RepoExtraTab = "configs" | "decisions" | "files";

export type AnyTab = UniversalTab | CapabilityExtraTab | RepoExtraTab;

interface TabSpec {
  key: AnyTab;
  label: string;
  /** Optional count badge next to the label. */
  badge?: number | string;
  /** Hidden text rendered for screen readers next to the label. */
  srHint?: string;
}

/** Returns the canonical tab list for a scope. Org has Operations; Capability
 *  replaces Operations with its scope-specific extras; Repo has Configs. */
function tabsForScope(scope: ScopeKind): TabSpec[] {
  if (scope === "org") {
    return [
      { key: "blueprint",  label: "Blueprint" },
      { key: "topology",   label: "Topology"  },
      { key: "decisions",  label: "Decisions" },
      { key: "activity",   label: "Activity"  },
      { key: "operations", label: "Operations" },
    ];
  }
  if (scope === "capability") {
    return [
      { key: "blueprint", label: "Blueprint" },
      { key: "topology",  label: "Topology"  },
      { key: "knowledge", label: "Knowledge" },
      { key: "decisions", label: "Decisions" },
      { key: "activity",  label: "Activity"  },
      { key: "repos",     label: "Repos"     },
      { key: "sources",   label: "Sources"   },
      { key: "notes",     label: "Notes"     },
      { key: "tasks",     label: "Tasks"     },
      { key: "members",   label: "Members"   },
      { key: "config",    label: "Config"    },
      { key: "danger",    label: "Danger zone", srHint: "Destructive actions, cap-admin only" },
    ];
  }
  // repo
  return [
    { key: "blueprint", label: "Blueprint" },
    { key: "topology",  label: "Topology"  },
    { key: "files",     label: "Files"     },
    { key: "decisions", label: "Decisions" },
    { key: "activity",  label: "Activity"  },
    { key: "configs",   label: "Configs"   },
  ];
}

interface ScopeTabsProps {
  scope: ScopeKind;
  activeTab: AnyTab;
  onChange: (tab: AnyTab) => void;
  /** Optional badge overrides keyed by tab. Values may be undefined / 0 /
   *  null to suppress the badge. */
  badges?: Partial<Record<AnyTab, number | string | undefined | null>> | undefined;
  className?: string | undefined;
}

export function ScopeTabs({ scope, activeTab, onChange, badges, className }: ScopeTabsProps) {
  const tabs = tabsForScope(scope);
  return (
    <nav
      className={cn(
        "flex flex-wrap gap-1 border-b border-[var(--border)] -mb-px",
        className,
      )}
      role="tablist"
      aria-label={`${scope} surface tabs`}
    >
      {tabs.map((t) => {
        const isActive = t.key === activeTab;
        const badge = badges?.[t.key] ?? t.badge;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-2 border-b-2 px-3 py-1.5 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              isActive
                ? "border-[var(--primary)] text-[var(--text)]"
                : "border-transparent text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:text-[var(--text)]",
            )}
            data-tab={t.key}
          >
            {t.label}
            {t.srHint && <span className="sr-only">{t.srHint}</span>}
            {badge !== undefined && badge !== null && badge !== 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--surface-2)] px-1.5 py-0 text-[10px] font-semibold tabular-nums text-[var(--text-muted)]">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
