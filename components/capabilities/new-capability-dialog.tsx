"use client";

/**
 * NewCapabilityDialog — create a capability from the `/capabilities` list
 * page "New capability" button.
 *
 * Mirrors the create flow already proven in the onboarding wizard
 * (`/onboarding/[org_slug]`): name + auto-derived slug + optional
 * description → `api.capabilities.create` → toast + `onCreated`. Slug
 * uniqueness is enforced by the BE (409 → surfaced as an inline error on
 * the slug field). The Radix dialog shell matches `attach-repo-dialog.tsx`.
 */

import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Plus, X } from "lucide-react";

import { api, ApiError, type Capability } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once after a successful create with the new capability so the
   *  parent can refresh its list and/or navigate to the new cap. */
  onCreated: (cap: Capability) => void;
}

/** Same rules as the onboarding wizard's slugify so slugs are consistent
 *  across both create paths. */
function slugify(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function NewCapabilityDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Once the user edits the slug by hand, stop auto-syncing it from name.
  const [slugDirty, setSlugDirty] = useState(false);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);

  // Reset to a clean slate whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setName("");
      setSlug("");
      setSlugDirty(false);
      setDesc("");
      setBusy(false);
      setSlugError(null);
    }
  }, [open]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name || !slug || busy) return;
    setBusy(true);
    setSlugError(null);
    try {
      // exactOptionalPropertyTypes is on — only include description when set.
      const body: { slug: string; name: string; description?: string } = { slug, name };
      if (desc.trim()) body.description = desc.trim();
      const cap = await api.capabilities.create(body);
      onCreated(cap);
      onOpenChange(false);
    } catch (err) {
      // The BE returns a 409 with field="slug" for a duplicate slug — show
      // it inline on the field rather than only as a toast.
      if (err instanceof ApiError && err.field === "slug") {
        setSlugError(err.message);
      } else {
        setSlugError(err instanceof ApiError ? err.message : "Couldn't create capability.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className="glass fixed left-1/2 top-1/2 z-50 flex max-h-[min(640px,calc(100vh-2rem))] w-[min(520px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl shadow-[var(--shadow-3)] focus:outline-none data-[state=open]:motion-safe:animate-in data-[state=open]:motion-safe:fade-in data-[state=open]:motion-safe:zoom-in-95 data-[state=closed]:motion-safe:animate-out data-[state=closed]:motion-safe:fade-out"
          aria-describedby="new-cap-desc"
        >
          <Stack gap="3" className="rounded-t-xl border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent p-5 shadow-[var(--inner-highlight)]">
            <Cluster justify="between" align="center">
              <Dialog.Title className="text-lg font-semibold">New capability</Dialog.Title>
              <Dialog.Close
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
                aria-label="Close"
              >
                <X className="size-4" />
              </Dialog.Close>
            </Cluster>
            <Dialog.Description id="new-cap-desc" className="text-sm text-[var(--text-muted)]">
              A capability is a business surface your team owns end-to-end — it
              bundles repos, rules, and history.
            </Dialog.Description>
          </Stack>

          <form onSubmit={onSubmit}>
            <Stack gap="4" className="p-5">
              <label className="block text-sm">
                <span className="mb-1 inline-block font-medium">Name</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugDirty) setSlug(slugify(e.target.value));
                  }}
                  placeholder="Payments"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 inline-block font-medium">Slug</span>
                <input
                  value={slug}
                  onChange={(e) => {
                    setSlug(slugify(e.target.value));
                    setSlugDirty(true);
                    setSlugError(null);
                  }}
                  placeholder="payments"
                  aria-invalid={slugError ? true : undefined}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] aria-[invalid=true]:border-[var(--danger)]"
                />
                {slugError ? (
                  <span className="mt-1 block text-xs text-[var(--danger)]">{slugError}</span>
                ) : (
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    Lowercase, hyphenated. Used in URLs; must be unique in your org.
                  </span>
                )}
              </label>

              <label className="block text-sm">
                <span className="mb-1 inline-block font-medium">
                  Description <span className="text-[var(--text-subtle)]">(optional)</span>
                </span>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={3}
                  placeholder="What this capability owns end-to-end."
                  className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                />
              </label>
            </Stack>

            <Cluster justify="between" align="center" className="border-t border-[var(--border)] p-3">
              <span className="text-xs text-[var(--text-muted)]">
                Creates an empty capability — attach repos next.
              </span>
              <Cluster gap="2" align="center">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !name || !slug}>
                  {busy ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="size-4" aria-hidden />
                  )}
                  {busy ? "Creating…" : "Create capability"}
                </Button>
              </Cluster>
            </Cluster>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
