"use client";

/**
 * InviteLinkModal - surfaces a freshly-minted link-mode invitation
 * (§5.4 row 3) with copy-to-clipboard, regenerate, and revoke actions.
 *
 * The raw token only ever lives in the CREATE response - it's never
 * re-emitted on list/get. "Regenerate" revokes the current row and
 * mints a new one. "Revoke" closes the modal and removes the row.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Link as LinkIcon, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type Invitation } from "@/lib/api/client";

export function InviteLinkModal({
  activeOrgId,
  invitation,
  role,
  onClose,
  onRegenerated,
  onRevoked,
}: {
  activeOrgId: string;
  /** The invitation as returned from `api.invitations.createLink` -
   *  carries the one-shot `invitation_url`. */
  invitation: Invitation;
  /** Role to use on Regenerate. The original mint preserved this so a
   *  regen lands on the same role without re-opening the parent form. */
  role: string;
  onClose: () => void;
  /** Called after Regenerate with the new invitation (fresh token + url). */
  onRegenerated: (inv: Invitation) => void;
  /** Called after Revoke. */
  onRevoked: () => Promise<void> | void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"copy" | "regen" | "revoke" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = invitation.invitation_url
    ? new URL(invitation.invitation_url, typeof window !== "undefined" ? window.location.origin : "https://athena.app").toString()
    : "";

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, busy]);

  const copy = useCallback(async () => {
    if (!url || busy) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy - copy it manually below.");
    } finally {
      setBusy(null);
    }
  }, [url, busy]);

  const regenerate = useCallback(async () => {
    if (busy) return;
    setBusy("regen");
    setError(null);
    try {
      // Revoke the prior row, then mint a fresh link with the same
      // role. Two requests rather than one /rotate so the BE surface
      // stays small (no new endpoint).
      await api.invitations.revoke(activeOrgId, invitation.id);
      const fresh = await api.invitations.createLink(activeOrgId, { role });
      onRegenerated(fresh);
      toast.success("Invite link regenerated");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to regenerate link");
    } finally {
      setBusy(null);
    }
  }, [activeOrgId, busy, invitation.id, onRegenerated, role]);

  const revoke = useCallback(async () => {
    if (busy) return;
    setBusy("revoke");
    setError(null);
    try {
      await api.invitations.revoke(activeOrgId, invitation.id);
      toast.success("Invite link revoked");
      await onRevoked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke link");
      setBusy(null);
    }
  }, [activeOrgId, busy, invitation.id, onRevoked]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="invite-link-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <Card
        variant="glass"
        className="w-full max-w-lg shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Stack gap="4">
          <Stack gap="1">
            <Cluster gap="2" align="center">
              <LinkIcon className="size-4 text-[var(--primary)]" aria-hidden />
              <span id={titleId} className="text-base font-semibold">
                Your invite link is ready
              </span>
            </Cluster>
            <p className="text-xs text-[var(--text-muted)]">
              Anyone with this URL can sign in with GitHub and join as{" "}
              <code>{invitation.role}</code>. Treat it like a secret -
              the token lives in the URL. Revoke once everyone you
              intended has joined.
            </p>
          </Stack>

          <Stack gap="1.5">
            <label
              htmlFor={`${titleId}-url`}
              className="text-xs font-medium text-[var(--text-muted)]"
            >
              Invite URL (one-shot - never shown again)
            </label>
            <Cluster gap="2" align="center">
              <input
                id={`${titleId}-url`}
                type="text"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="invite-link-url"
                className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void copy()}
                disabled={busy !== null}
                data-testid="invite-link-copy"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </Cluster>
          </Stack>

          {error && (
            <p
              role="alert"
              className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]"
            >
              {error}
            </p>
          )}

          <Cluster justify="between" gap="2">
            <Cluster gap="1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void regenerate()}
                disabled={busy !== null}
                loading={busy === "regen"}
                data-testid="invite-link-regenerate"
              >
                <RefreshCw className="size-3.5" />
                Regenerate
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void revoke()}
                disabled={busy !== null}
                loading={busy === "revoke"}
                data-testid="invite-link-revoke"
              >
                <Trash2 className="size-3.5" />
                Revoke
              </Button>
            </Cluster>
            <Button
              ref={closeButtonRef}
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClose}
              disabled={busy !== null}
            >
              Done
            </Button>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}
