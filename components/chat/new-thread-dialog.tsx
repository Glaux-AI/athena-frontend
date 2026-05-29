"use client";

/**
 * NewThreadDialog — modal launched from the "+" buttons in
 * `/chat` and `<ChatDrawer>`.
 *
 * Wraps three controls:
 *   - scope picker  · "Org" vs. "Capability" (capability rows fetched
 *                     on open; pre-selected when `defaultCapabilityId`
 *                     is supplied — set by the drawer when the user is
 *                     on `/capabilities/[id]`).
 *   - title         · optional; auto-generated from the first ~60
 *                     chars of the initial message if blank.
 *   - initial msg   · required; non-empty after trim, ≤32_000 chars.
 *
 * Submit → `api.chat.createThread({...})`. On success the new thread id
 * is handed back via `onCreated` so callers can navigate / select it.
 * Esc + backdrop click dismiss (matches the dismissable-modal contract
 * used by `<RejectGateModal>`).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type Capability } from "@/lib/api/client";

const MESSAGE_MAX = 32_000;
const TITLE_MAX = 300;

export function NewThreadDialog({
  onClose,
  onCreated,
  defaultCapabilityId,
}: {
  onClose: () => void;
  /** Called with the new thread id after a successful create. */
  onCreated: (threadId: string) => void;
  /** When set, the dialog opens with `capability` scope pre-selected
   *  and `scope_id` defaulted to this id. Used by `<ChatDrawer>` when
   *  the user is on `/capabilities/[id]`. */
  defaultCapabilityId?: string | null;
}) {
  const titleId = useId();
  const messageId = useId();
  const scopeId = useId();
  const titleFieldId = useId();

  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [scopeKind, setScopeKind] = useState<"org" | "capability">(
    defaultCapabilityId ? "capability" : "org",
  );
  const [capabilityId, setCapabilityId] = useState<string>(defaultCapabilityId ?? "");
  const [title, setTitle] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Focus message on mount.
  useEffect(() => {
    messageRef.current?.focus();
  }, []);

  // Esc closes.
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, submitting]);

  // Fetch capabilities once on open so the picker has rows. We do
  // this even when `defaultCapabilityId` is set so the user can still
  // override (e.g. the drawer is open on /capabilities/X but the
  // user wants a thread against capability Y).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.capabilities.list("false");
        if (!cancelled) setCapabilities(list);
      } catch {
        // Soft failure — the org-scope path still works without caps.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const trimmedMessage = message.trim();
  const messageTooLong = message.length > MESSAGE_MAX;
  const titleTooLong = title.length > TITLE_MAX;
  const needsCapability = scopeKind === "capability" && !capabilityId;
  const submitDisabled =
    submitting || trimmedMessage.length === 0 || messageTooLong || titleTooLong || needsCapability;

  const autoTitle = useMemo(() => {
    const t = title.trim();
    if (t) return t;
    const firstLine = trimmedMessage.split("\n")[0]?.trim() ?? "";
    return firstLine.slice(0, 60) || "New chat";
  }, [title, trimmedMessage]);

  const handleSubmit = useCallback(async () => {
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const { thread } = await api.chat.createThread({
        title: autoTitle.slice(0, TITLE_MAX),
        scope_kind: scopeKind,
        ...(scopeKind === "capability" ? { scope_id: capabilityId } : {}),
        initial_message: trimmedMessage,
      });
      onCreated(thread.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the thread.");
    } finally {
      setSubmitting(false);
    }
  }, [submitDisabled, autoTitle, scopeKind, capabilityId, trimmedMessage, onCreated]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="new-thread-dialog-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => { if (!submitting) onClose(); }}
    >
      <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Stack gap="4">
          <Cluster gap="2" align="center">
            <Sparkles className="size-4 text-[var(--primary)]" aria-hidden />
            <span id={titleId} className="text-base font-semibold">Start a new chat thread</span>
          </Cluster>

          <Stack gap="1.5">
            <label htmlFor={scopeId} className="text-xs font-medium text-[var(--text-muted)]">Scope</label>
            <Cluster gap="2">
              <Button type="button" size="sm" variant={scopeKind === "org" ? "primary" : "secondary"} onClick={() => setScopeKind("org")} disabled={submitting} data-action="scope-org">Org-wide</Button>
              <Button type="button" size="sm" variant={scopeKind === "capability" ? "primary" : "secondary"} onClick={() => setScopeKind("capability")} disabled={submitting} data-action="scope-capability">Capability</Button>
            </Cluster>
            {scopeKind === "capability" && (
              <select
                id={scopeId}
                value={capabilityId}
                onChange={(e) => setCapabilityId(e.target.value)}
                disabled={submitting}
                aria-invalid={needsCapability}
                className="mt-1 h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
              >
                <option value="">Pick a capability…</option>
                {capabilities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </Stack>

          <Stack gap="1.5">
            <label htmlFor={titleFieldId} className="text-xs font-medium text-[var(--text-muted)]">Title <span className="text-[var(--text-subtle)]">(optional)</span></label>
            <input
              id={titleFieldId}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={submitting}
              maxLength={TITLE_MAX}
              placeholder={autoTitle ? `e.g. ${autoTitle}` : "e.g. Debug retry storm"}
              className="h-9 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
            />
          </Stack>

          <Stack gap="1.5">
            <label htmlFor={messageId} className="text-xs font-medium text-[var(--text-muted)]">First message <span className="text-[var(--danger)]">*</span></label>
            <textarea
              ref={messageRef}
              id={messageId}
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={submitting}
              aria-invalid={messageTooLong}
              placeholder="Ask anything in this scope — Athena will answer with citations."
              className="min-h-[120px] resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-60"
            />
            <Cluster justify="end" align="center">
              <span className={`text-[10px] tabular-nums ${messageTooLong ? "text-[var(--danger)]" : "text-[var(--text-subtle)]"}`}>
                {message.length}/{MESSAGE_MAX}
              </span>
            </Cluster>
          </Stack>

          {error && (
            <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </p>
          )}

          <Cluster justify="end" gap="2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={submitting} data-action="cancel">
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitDisabled} loading={submitting} data-action="submit">
              Start thread
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
