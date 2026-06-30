"use client";

/**
 * <MemberPicker> - a type-to-search picker over the org's people.
 *
 * Athena already knows everyone in the org, so anywhere you assign or add a
 * person you should be able to start typing a name and pick from suggestions -
 * never hunt for an exact email. This is the shared primitive behind every
 * people selector: the domain + team rosters, the task owner control, bulk
 * reassign, and ownership transfer all mount it so the behavior (search by name
 * or email, keyboard nav, avatars) is identical everywhere.
 *
 * The caller owns the candidate pool (`members`, usually from `useMembers()`,
 * pre-filtered to drop people who can't be picked) and the selection (`value` +
 * `onSelect`). Two trigger modes: pass your own trigger as `children` (wrapped
 * `asChild`, e.g. the owner-control avatar button) or omit it for the default
 * field-style trigger used by forms. `header` / `footer` render caller-specific
 * rows (e.g. "Assign to me", "Unassign", an invite CTA) and receive a `close`
 * callback; `emptyState` shows when the search matches nobody; `loading` shows
 * skeleton rows while the roster is still resolving (so a slow fetch never reads
 * as "nobody to add").
 *
 * Accessibility follows the WAI-ARIA combobox/listbox pattern (matching the
 * repo's `explorer-search-bar`): the search input is the combobox, the rows are
 * the listbox options, and `aria-activedescendant` announces the arrow-key
 * highlight while focus stays on the input.
 */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";

import { ActorAvatar } from "@/components/mascot/actor-avatar";
import type { Member } from "@/lib/api/client";
import { cn } from "@/lib/cn";

/** Cap rows mounted at once - the candidate pool can be a whole 1000+ org. */
const RESULT_CAP = 50;

export interface MemberPickerProps {
  /** Candidate people. Caller pre-filters (e.g. drop those already on the roster). */
  members: Member[];
  /** Selected user id - drives the check mark + the default trigger label. */
  value?: string | null;
  onSelect: (member: Member) => void;
  /** True while the roster is still loading - shows skeleton rows, not "empty". */
  loading?: boolean;
  disabled?: boolean;
  align?: "start" | "end";
  side?: "top" | "bottom";
  /** Default-trigger placeholder when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** A short heading above the member list (e.g. "Members"). */
  listLabel?: string;
  /** Rows rendered above the list, unfiltered (e.g. "Assign to me"). */
  header?: (close: () => void) => ReactNode;
  /** Rows rendered below the list (e.g. "Unassign", an invite CTA). */
  footer?: (close: () => void) => ReactNode;
  /** Shown when the search matches no member. */
  emptyState?: ReactNode;
  /** Custom trigger, wrapped in `Popover.Trigger asChild`. Omit for the default. */
  children?: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  "data-testid"?: string;
}

function matchesQuery(m: Member, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    m.display_name.toLowerCase().includes(needle) ||
    m.email.toLowerCase().includes(needle)
  );
}

export function MemberPicker({
  members,
  value = null,
  onSelect,
  loading = false,
  disabled,
  align = "start",
  side = "bottom",
  placeholder = "Pick a person…",
  searchPlaceholder = "Search by name or email…",
  listLabel,
  header,
  footer,
  emptyState,
  children,
  triggerClassName,
  contentClassName,
  "data-testid": dataTestId,
}: MemberPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => members.filter((m) => matchesQuery(m, query)),
    [members, query],
  );
  const truncated = filtered.length > RESULT_CAP;
  const visible = truncated ? filtered.slice(0, RESULT_CAP) : filtered;
  const selected = value ? members.find((m) => m.user_id === value) ?? null : null;
  const showSkeleton = loading && members.length === 0;
  const activeId =
    visible[activeIndex] ? `${listId}-opt-${activeIndex}` : undefined;

  // Keep the arrow-highlighted row scrolled into view in a long list. Guarded
  // for jsdom, where scrollIntoView is not implemented.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const close = () => setOpen(false);
  const pick = (m: Member) => {
    onSelect(m);
    setOpen(false);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveIndex(0);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = visible[activeIndex];
      if (m) pick(m);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        {children ?? (
          <button
            type="button"
            disabled={disabled}
            data-testid={dataTestId}
            className={cn(
              "inline-flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-sm transition-colors",
              "hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
              triggerClassName,
            )}
          >
            {selected ? (
              <>
                <ActorAvatar name={selected.display_name} size={20} />
                <span className="min-w-0 flex-1 truncate text-[var(--text)]">
                  {selected.display_name}
                  <span className="ml-1.5 text-xs text-[var(--text-muted)]">{selected.email}</span>
                </span>
              </>
            ) : (
              <span className="flex-1 truncate text-[var(--text-muted)]">{placeholder}</span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          side={side}
          sideOffset={6}
          // Keep focus ours - land on the search input, not the first row.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            "glass animate-modal-in z-50 overflow-hidden rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none",
            children ? "w-64" : "w-[var(--radix-popover-trigger-width)] min-w-[15rem]",
            contentClassName,
          )}
        >
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[var(--border-accent)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
            <Search className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              {...(activeId ? { "aria-activedescendant": activeId } : {})}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              data-testid={dataTestId ? `${dataTestId}-search` : undefined}
              className="w-full bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none"
            />
          </div>

          <div ref={listRef} className="mt-1 max-h-[16rem] overflow-y-auto">
            {header?.(close)}
            {listLabel && (
              <p className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
                {listLabel}
              </p>
            )}
            <div
              role="listbox"
              id={listId}
              aria-label={listLabel ?? "People"}
              aria-busy={showSkeleton}
            >
              {showSkeleton ? (
                <SkeletonRows />
              ) : visible.length === 0 ? (
                <div role="presentation" className="px-2 py-2 text-xs text-[var(--text-muted)]">
                  {emptyState ??
                    (members.length === 0
                      ? "No teammates yet."
                      : `No people match "${query.trim()}".`)}
                </div>
              ) : (
                visible.map((m, i) => (
                  <button
                    key={m.user_id}
                    type="button"
                    role="option"
                    id={`${listId}-opt-${i}`}
                    data-index={i}
                    aria-selected={i === activeIndex}
                    onClick={() => pick(m)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      i === activeIndex ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]",
                    )}
                  >
                    <ActorAvatar name={m.display_name} size={20} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[var(--text)]">{m.display_name}</span>
                      <span className="block truncate text-xs text-[var(--text-muted)]">{m.email}</span>
                    </span>
                    {m.user_id === value && (
                      <Check className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
                    )}
                  </button>
                ))
              )}
            </div>
            {truncated && (
              <p className="px-2 py-1.5 text-[11px] text-[var(--text-subtle)]">
                Showing the first {RESULT_CAP}. Keep typing to narrow.
              </p>
            )}
            {footer?.(close)}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-1 p-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2 px-1 py-1">
          <div className="size-5 shrink-0 animate-pulse rounded-full bg-[var(--surface-2)]" />
          <div className="h-3 flex-1 animate-pulse rounded bg-[var(--surface-2)]" />
        </div>
      ))}
    </div>
  );
}
