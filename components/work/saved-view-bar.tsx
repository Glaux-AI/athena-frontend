"use client";

/**
 * SavedViewBar - named /work filter bundles as one-click chips (Work OS
 * rehaul W7). A saved view IS a URL: applying one just router.replace's its
 * params, so deep-link parity is free and the URL stays the single source of
 * truth. Chips order team-pinned -> shared -> mine; the chip whose params
 * subset-match the current URL highlights as active.
 *
 * Kept deliberately calm: the bar hides when there are no saved views AND no
 * active filters, soft-fails to hidden if the endpoint errors, and only
 * offers "Save view" once you've actually narrowed something. Owner-only
 * management (update / pin to a lead team / delete) lives behind the active
 * chip's kebab - server-enforced, we just attempt and surface a 4xx toast.
 */

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Bookmark, MoreHorizontal, Pin } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type MyTeam, type SavedView } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { Cluster } from "@/components/layout/primitives";
import { WORK_PARAM_KEYS } from "@/components/board/board-toolbar";
import { bestMatchingViewId, useViews } from "@/hooks/use-views";
import { cn } from "@/lib/cn";

/** Snapshot the current URL's work params (empties stripped) - exactly what a
 *  saved view stores. */
export function captureWorkParams(sp: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of WORK_PARAM_KEYS) {
    const v = sp.get(key);
    if (v && v.trim() !== "") out[key] = v.trim();
  }
  return out;
}

/** Team-pinned first, then org-shared, then your private views; names sort
 *  each band so the bar is stable across reloads. */
function orderViews(views: SavedView[]): SavedView[] {
  const band = (v: SavedView) => (v.team_id ? 0 : v.shared ? 1 : 2);
  return [...views].sort((a, b) => band(a) - band(b) || a.name.localeCompare(b.name));
}

export function SavedViewBar({
  myTeams,
  meId,
  effectiveScope,
}: {
  /** The caller's teams (null while loading) - lead roles gate "Pin as team
   *  default". */
  myTeams: MyTeam[] | null;
  meId: string | null;
  /** The scope IN FORCE (URL pick or the teams-derived default). Snapshots
   *  must pin it explicitly: an auto scope resolves differently per user, so
   *  a shared view saved without it would show everyone a different set. */
  effectiveScope?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { views, isLoading, error, reload } = useViews();

  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = useMemo(() => {
    const params = captureWorkParams(searchParams);
    if (!params.scope && effectiveScope) params.scope = effectiveScope;
    return params;
  }, [searchParams, effectiveScope]);
  const filtersActive = Object.keys(current).length > 0;

  // Soft-fail: a broken views endpoint hides the bar, never the page.
  if (error) return null;
  // Calm surface: nothing saved and nothing filtered = no bar at all.
  if (isLoading && !filtersActive) return null;
  if (!isLoading && views.length === 0 && !filtersActive) return null;

  const ordered = orderViews(views);
  const activeId = bestMatchingViewId(ordered, current);
  const leadTeams = (myTeams ?? []).filter((t) => t.role === "lead");

  const apply = (view: SavedView) => {
    const qs = new URLSearchParams(view.params).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const mutate = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      setMenuFor(null);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "That didn't work - try again.");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.views.create({ name: trimmed, params: current, shared });
      toast.success("View saved.");
      setSaveOpen(false);
      setName("");
      setShared(false);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the view.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Cluster gap="2" align="center" className="flex-wrap">
      {isLoading ? (
        <span className="flex items-center gap-2" aria-hidden>
          {[0, 1].map((i) => (
            <span key={i} className="h-6 w-24 animate-pulse rounded-full bg-[var(--surface-2)]" />
          ))}
        </span>
      ) : (
        ordered.map((view) => {
          const active = view.id === activeId;
          const owned = meId !== null && view.owner_user_id === meId;
          return (
            <span
              key={view.id}
              className={cn(
                "inline-flex items-center rounded-full border text-xs transition-colors",
                active
                  ? "border-transparent bg-[var(--primary-soft)] text-[var(--primary)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              <button
                type="button"
                aria-pressed={active}
                onClick={() => apply(view)}
                title={view.team_id ? "Team default view" : view.shared ? "Shared with the org" : "Your view"}
                className="inline-flex items-center gap-1 rounded-full py-1 pl-2.5 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {view.team_id && <Pin className="size-3" aria-hidden />}
                <span className="max-w-[10rem] truncate">{view.name}</span>
              </button>
              {active && owned && (
                <Popover.Root
                  open={menuFor === view.id}
                  onOpenChange={(o) => setMenuFor(o ? view.id : null)}
                >
                  <Popover.Trigger asChild>
                    <button
                      type="button"
                      aria-label={`Manage the view "${view.name}"`}
                      className="mr-1 rounded-full p-0.5 transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      <MoreHorizontal className="size-3.5" aria-hidden />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      align="start"
                      sideOffset={4}
                      className="glass animate-modal-in z-50 w-56 rounded-lg border border-[var(--border)] p-1 shadow-[var(--shadow-3)] focus:outline-none"
                    >
                      <div role="menu" aria-label={`Manage ${view.name}`}>
                        <MenuRow
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () => api.views.update(view.id, { params: current }),
                              "View updated to the current filters.",
                            )
                          }
                        >
                          Save changes
                        </MenuRow>
                        {leadTeams.map((t) => (
                          <MenuRow
                            key={t.id}
                            disabled={busy || view.team_id === t.id}
                            onClick={() =>
                              void mutate(
                                () => api.views.update(view.id, { team_id: t.id }),
                                `Pinned as ${t.name}'s default view.`,
                              )
                            }
                          >
                            <Pin className="size-3.5 text-[var(--text-subtle)]" aria-hidden />
                            Pin as {t.name} default
                          </MenuRow>
                        ))}
                        {view.team_id !== null && (
                          <MenuRow
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                () => api.views.update(view.id, { team_id: null }),
                                "Unpinned from the team.",
                              )
                            }
                          >
                            Unpin from team
                          </MenuRow>
                        )}
                        <div className="my-1 h-px bg-[var(--border)]" />
                        <MenuRow
                          disabled={busy}
                          destructive
                          onClick={() =>
                            void mutate(() => api.views.remove(view.id), "View deleted.")
                          }
                        >
                          Delete view
                        </MenuRow>
                      </div>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              )}
            </span>
          );
        })
      )}

      {filtersActive && (
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] px-2.5 py-1 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <Bookmark className="size-3" aria-hidden />
          Save view
        </button>
      )}

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save this view"
        description="Names the current filters so you (or the org) can come back to them in one click."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!name.trim() || saving} onClick={() => void save()}>
              {saving ? "Saving…" : "Save view"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-[var(--text-muted)]">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="e.g. Payments bugs"
              aria-label="View name"
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--text)]">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="size-3.5 accent-[var(--primary)]"
            />
            Share with everyone in the org
          </label>
        </div>
      </Modal>
    </Cluster>
  );
}

function MenuRow({
  children,
  onClick,
  disabled = false,
  destructive = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50",
        destructive
          ? "text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]"
          : "text-[var(--text)] hover:bg-[var(--surface-2)]",
      )}
    >
      {children}
    </button>
  );
}
