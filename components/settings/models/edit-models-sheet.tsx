"use client";

/**
 * §7.8.1 - "Edit models" sheet, opened from a provider card on
 * `/settings/models`.
 *
 * After a provider/key is configured its card shows the enabled models
 * read-only (chips). This sheet is the in-place editor for that set: it
 * lists the provider's full catalog as checkboxes - reusing the exact
 * model rows from the "Add provider" sheet (`ModelCheckboxList`) - and is
 * prefilled with the provider's current `enabled_models`. Save sends
 * `PATCH /v1/orgs/{id}/model-providers/{id}` with the new
 * `{ enabled_models }`; the API key is untouched.
 *
 * Mirrors the AddProviderSheet dialog chrome + the page's mutation
 * conventions (in-button progress, toast on success/error). Permission is
 * enforced server-side - a caller without `model_providers_manage` gets a
 * 403 surfaced as an error toast, same as Add / Revoke / Remove.
 */

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type CatalogProvider,
  type ModelProvider,
} from "@/lib/api/client";

import { ModelCheckboxList, toggleSet } from "./add-provider-sheet";

export function EditModelsSheet({
  open,
  orgId,
  provider,
  catalogEntry,
  providerDisplayName,
  onClose,
  onSaved,
}: {
  open: boolean;
  orgId: string;
  provider: ModelProvider;
  /** The matching catalog entry (by id) - supplies the selectable model
   *  list. Null when the provider isn't in the catalog (legacy row). */
  catalogEntry: CatalogProvider | null;
  providerDisplayName: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content
          role="dialog"
          aria-labelledby="edit-models-title"
          data-testid="edit-models-sheet"
          className="glass fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100%-2rem))] max-h-[min(720px,calc(100vh-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl shadow-[var(--shadow-3)] focus:outline-none"
        >
          {open ? (
            <EditModelsBody
              orgId={orgId}
              provider={provider}
              catalogEntry={catalogEntry}
              providerDisplayName={providerDisplayName}
              onClose={onClose}
              onSaved={onSaved}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}


function EditModelsBody({
  orgId,
  provider,
  catalogEntry,
  providerDisplayName,
  onClose,
  onSaved,
}: {
  orgId: string;
  provider: ModelProvider;
  catalogEntry: CatalogProvider | null;
  providerDisplayName: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  // Prefill with the provider's current enabled models. The Dialog
  // remounts the body on each open (the `open ? … : null` gate above), so
  // a plain useState seeded from props is enough - no reset effect needed.
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(provider.enabled_models),
  );
  const [submitting, setSubmitting] = useState(false);

  const dirty = useMemo(() => {
    const before = new Set(provider.enabled_models);
    if (before.size !== enabled.size) return true;
    for (const id of enabled) if (!before.has(id)) return true;
    return false;
  }, [enabled, provider.enabled_models]);

  const save = async () => {
    if (enabled.size === 0) {
      toast.error("Select at least one model.");
      return;
    }
    setSubmitting(true);
    try {
      await api.modelProviders.patch(orgId, provider.id, {
        enabled_models: Array.from(enabled),
      });
      toast.success(`Updated models for ${providerDisplayName}.`);
      await onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update models.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="0">
      <Cluster
        justify="between"
        align="center"
        className="border-b border-[var(--border)] px-5 py-3"
      >
        <Stack gap="0">
          <h2 id="edit-models-title" className="text-base font-semibold">
            Edit models · {providerDisplayName}
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            Choose which models this provider key is used for.
          </p>
        </Stack>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
          <X className="size-4" />
        </Button>
      </Cluster>

      <Stack gap="3" className="max-h-[600px] overflow-y-auto p-4">
        {catalogEntry === null ? (
          <p className="text-sm text-[var(--text-muted)]">
            This provider isn&apos;t in the current catalog, so its model
            list can&apos;t be edited here. Remove and re-add it to change
            the enabled models.
          </p>
        ) : (
          <>
            <ModelCheckboxList
              provider={catalogEntry}
              enabled={enabled}
              onToggleModel={(id) => setEnabled((s) => toggleSet(s, id))}
            />
            {enabled.size === 0 && (
              <p className="rounded-md border border-[var(--border)] bg-[var(--warning-soft)] px-2 py-1 text-[11px] text-[var(--warning-ink)]">
                Select at least one model - saving with none enabled isn&apos;t
                allowed.
              </p>
            )}
            <Cluster justify="end" gap="2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={save}
                disabled={submitting || enabled.size === 0 || !dirty}
              >
                {submitting ? "Saving…" : "Save models"}
              </Button>
            </Cluster>
          </>
        )}
      </Stack>
    </Stack>
  );
}
