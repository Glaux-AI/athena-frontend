"use client";

/**
 * ConnectButton - kicks off the per-provider OAuth flow (Agent EEE).
 *
 * Click → `oauthStart(orgId, provider)` → opens the `authorize_url` in
 * a new window (not the current tab - the user's settings-page state
 * survives the round-trip). Inline "Awaiting OAuth..." spinner until the
 * popup closes OR the timeout fires; both call `onComplete` so the
 * parent re-fetches the catalog and learns the new status.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Plug } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { oauthStart, type ProviderSlug } from "@/lib/api/integrations";
import { ApiError } from "@/lib/api/client";

const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 720;
/** Cap the awaiting spinner if the user abandons the popup (5 min). */
const AWAITING_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 500;

export function ConnectButton({
  orgId,
  provider,
  providerName,
  onComplete,
  /** "Reconnect" label for revoked rows; otherwise "Connect". */
  label = "Connect",
}: {
  /** Active org id. The canonical OAuth-initiate route embeds it in the
   *  path; the caller threads it from `useSession().activeOrgId`. */
  orgId: string;
  provider: ProviderSlug;
  providerName: string;
  onComplete: () => void;
  label?: string;
}) {
  const [awaiting, setAwaiting] = useState<boolean>(false);
  const popupRef = useRef<Window | null>(null);
  const pollHandleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tearDown = useCallback(() => {
    if (pollHandleRef.current !== null) clearInterval(pollHandleRef.current);
    if (timeoutHandleRef.current !== null) clearTimeout(timeoutHandleRef.current);
    pollHandleRef.current = null;
    timeoutHandleRef.current = null;
    popupRef.current = null;
    setAwaiting(false);
  }, []);

  // Best-effort cleanup if the component unmounts while a popup is open.
  useEffect(() => () => tearDown(), [tearDown]);

  const handleClick = useCallback(async () => {
    setAwaiting(true);
    let response;
    try {
      response = await oauthStart(orgId, provider);
    } catch (e) {
      setAwaiting(false);
      toast.error(e instanceof ApiError ? e.message : `Couldn't start ${providerName} OAuth.`);
      return;
    }

    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2));
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2));
    const features = `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes,noopener=no`;

    const popup = window.open(response.authorize_url, `${provider}-oauth`, features);
    if (popup === null) {
      // Popup blocked - fall back to a new tab so the flow still works.
      window.open(response.authorize_url, "_blank", "noopener");
      toast.info("Popup blocked - opened in a new tab. Refresh this page after authorizing.");
      setAwaiting(false);
      return;
    }
    popupRef.current = popup;

    pollHandleRef.current = setInterval(() => {
      if (popupRef.current?.closed) {
        tearDown();
        onComplete();
      }
    }, POLL_INTERVAL_MS);
    timeoutHandleRef.current = setTimeout(() => {
      tearDown();
      onComplete();
    }, AWAITING_TIMEOUT_MS);
  }, [orgId, provider, providerName, onComplete, tearDown]);

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => void handleClick()}
      disabled={awaiting}
      loading={awaiting}
      aria-label={awaiting ? `Awaiting ${providerName} OAuth` : `Connect ${providerName}`}
      data-action="connect"
    >
      {awaiting ? "Awaiting OAuth..." : (
        <>
          <Plug className="size-3" aria-hidden />
          {label}
        </>
      )}
    </Button>
  );
}
