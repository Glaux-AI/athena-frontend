"use client";

/**
 * Cloudflare Turnstile widget - CAPTCHA for the email-OTP send.
 *
 * Rendered on the sign-in card whenever a Turnstile site key is configured
 * (`config.captchaEnabled`). Uses the **managed / interaction-only** mode:
 * the widget is invisible until a challenge is actually needed, and it
 * auto-solves in the common case, calling `onToken` with a fresh token.
 *
 * The token is single-use and expires - bump `resetNonce` after every send
 * (or on an expiry) to force a fresh token for the next attempt.
 *
 * The script is loaded once per tab via a module-level promise; the CSP in
 * `middleware.ts` allows `challenges.cloudflare.com` on script/frame/connect.
 */

import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      size?: "normal" | "flexible" | "compact";
      theme?: "auto" | "light" | "dark";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile_script_failed")));
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile_script_failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export function Turnstile({
  siteKey,
  onToken,
  onError,
  resetNonce = 0,
  theme = "auto",
  className,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onError?: () => void;
  /** Increment to force a fresh token (after a send/resend or an expiry). */
  resetNonce?: number;
  theme?: "auto" | "light" | "dark";
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callbacks without re-rendering the widget.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        if (widgetIdRef.current) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          size: "flexible",
          theme,
          callback: (token: string) => onTokenRef.current(token),
          "error-callback": () => onErrorRef.current?.(),
          "expired-callback": () => {
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current);
            }
          },
        });
      })
      .catch(() => onErrorRef.current?.());
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* widget already gone */
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, theme]);

  useEffect(() => {
    if (resetNonce > 0 && widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetNonce]);

  return <div ref={containerRef} className={className} />;
}
