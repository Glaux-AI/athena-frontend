"use client";

/**
 * LiveSignIn - the production passwordless auth flow, shared by /login (inside
 * the hero sign-in card) and /signup.
 *
 * Three options, one rule: **one email = one auth method**.
 *   - Continue with GitHub / Google  -> Supabase OAuth.
 *   - Email field -> `api.auth.identityLookup`:
 *       * an OAuth-registered email is auto-redirected to its provider
 *         (we never email an OTP to an account that can't use it);
 *       * otherwise we send a passwordless code (+ magic link) and switch to
 *         the code-entry step. The magic link lands on /auth/callback too.
 *   - The email-OTP send is CAPTCHA-gated (Cloudflare Turnstile) when
 *     `config.captchaEnabled`.
 *
 * After a verified code, we route to /auth/callback so the existing
 * sync + post-sign-in bootstrap runs (same path OAuth + magic link use).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Github, Loader2, Mail, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Turnstile } from "@/components/auth/turnstile";
import { config } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { api, ApiError } from "@/lib/api/client";
import { writeMockSession } from "@/lib/session/SessionProvider";
import { cn } from "@/lib/cn";

/** Demo identity used by the mock-mode shortcuts (no real Supabase). */
const MOCK_DEMO_EMAIL = "maya@lumen.dev";

type Provider = "github" | "google";

const PROVIDER_LABEL: Record<Provider, string> = { github: "GitHub", google: "Google" };

/** Google "G" mark (multi-color). simple-icons omits the brand colors, so the
 *  canonical four-color glyph is inlined here for the sign-in button. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z" />
    </svg>
  );
}

export function LiveSignIn({
  mode,
  returnTo,
  onSsoOpen,
  className,
}: {
  mode: "login" | "signup";
  returnTo: string;
  /** Only the /login landing wires the SSO modal; /signup omits it. */
  onSsoOpen?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0);
  const awaitingCaptcha = useRef(false);

  // Prefill from the auth-callback mismatch redirect: an email registered with
  // passwordless OTP lands here as ?method=email&email=... so the user can
  // finish via the right method.
  useEffect(() => {
    const m = params.get("method");
    const e = params.get("email");
    if (m === "email" && e) {
      setEmail(e);
      setNotice("This account uses email sign-in. Continue to get your code.");
    }
  }, [params]);

  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    setCaptchaNonce((n) => n + 1);
  }, []);

  // Mock mode (env=mock) has no Supabase: the provider buttons + the
  // email/code steps all resolve through the in-process mock session so the
  // exact same UI is fully walkable locally (and in the e2e demo).
  const completeMockSignIn = useCallback(
    async (mockEmail: string) => {
      setError(null);
      setPending(true);
      try {
        const result = await api.mockAuth.signIn({ email: mockEmail });
        writeMockSession(result);
        router.replace(returnTo);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Sign-in failed.");
        setPending(false);
      }
    },
    [returnTo, router],
  );

  const emailRedirectTo = () =>
    `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`;

  const signInOAuth = useCallback(
    async (provider: Provider) => {
      if (config.isMock) {
        void completeMockSignIn(MOCK_DEMO_EMAIL);
        return;
      }
      setError(null);
      setPending(true);
      try {
        if (!config.supabase.isConfigured()) {
          setError(
            "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local.",
          );
          setPending(false);
          setRedirecting(false);
          return;
        }
        const supabase = getBrowserSupabase();
        const options =
          provider === "github"
            ? { redirectTo: emailRedirectTo(), scopes: "read:user user:email" }
            : { redirectTo: emailRedirectTo() };
        const { error: err } = await supabase.auth.signInWithOAuth({ provider, options });
        if (err) {
          setError(err.message);
          setPending(false);
          setRedirecting(false);
        }
        // On success the browser navigates to the provider; nothing else to do.
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed.");
        setPending(false);
        setRedirecting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returnTo],
  );

  const doSendOtp = useCallback(
    async (token: string | null) => {
      setPending(true);
      setError(null);
      try {
        const supabase = getBrowserSupabase();
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            shouldCreateUser: true,
            emailRedirectTo: emailRedirectTo(),
            ...(token ? { captchaToken: token } : {}),
          },
        });
        if (err) {
          setError(err.message);
          resetCaptcha();
          return;
        }
        setSentTo(email.trim());
        setStep("code");
        setCode("");
        resetCaptcha();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send the code. Try again.");
        resetCaptcha();
      } finally {
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [email, returnTo, resetCaptcha],
  );

  const sendOtp = useCallback(async () => {
    if (config.isMock) {
      setNotice("Code re-sent (mock - any 6 digits work).");
      return;
    }
    // CAPTCHA-gated: if we don't have a token yet, mark that we're waiting and
    // let the Turnstile callback fire the send once it solves.
    if (config.captchaEnabled && !captchaToken) {
      awaitingCaptcha.current = true;
      setPending(true);
      return;
    }
    await doSendOtp(captchaToken);
  }, [captchaToken, doSendOtp]);

  const onCaptchaToken = useCallback(
    (token: string) => {
      setCaptchaToken(token);
      if (awaitingCaptcha.current) {
        awaitingCaptcha.current = false;
        void doSendOtp(token);
      }
    },
    [doSendOtp],
  );

  const onEmailSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setNotice(null);
      if (config.isMock) {
        // No real send; jump straight to the code step (any code verifies).
        setSentTo(email.trim());
        setCode("");
        setStep("code");
        return;
      }
      if (!config.supabase.isConfigured()) {
        setError(
          "Supabase isn't configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local.",
        );
        return;
      }
      setPending(true);
      let result;
      try {
        result = await api.auth.identityLookup(email.trim());
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Couldn't look up that email. Try again.",
        );
        setPending(false);
        return;
      }
      if (result.method === "oauth" && result.provider) {
        setRedirecting(true);
        setNotice(`This account uses ${PROVIDER_LABEL[result.provider]}. Taking you there...`);
        await signInOAuth(result.provider);
        return; // navigating away; keep the redirecting state
      }
      await sendOtp(); // manages its own pending
    },
    [email, sendOtp, signInOAuth],
  );

  const onVerify = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (config.isMock) {
        void completeMockSignIn((sentTo ?? email).trim() || MOCK_DEMO_EMAIL);
        return;
      }
      setError(null);
      setPending(true);
      try {
        const supabase = getBrowserSupabase();
        const { error: err } = await supabase.auth.verifyOtp({
          email: (sentTo ?? email).trim(),
          token: code.trim(),
          type: "email",
        });
        if (err) {
          setError("That code didn't match. Check it, or resend a new one.");
          return;
        }
        router.replace(`/auth/callback?returnTo=${encodeURIComponent(returnTo)}`);
      } catch {
        setError("Verification failed. Try again.");
      } finally {
        setPending(false);
      }
    },
    [code, email, sentTo, returnTo, router, completeMockSignIn],
  );

  const backToEmail = () => {
    setStep("email");
    setCode("");
    setError(null);
    setNotice(null);
  };

  const showSso = Boolean(onSsoOpen) && config.enterpriseSsoEnabled;

  return (
    <div className={cn("space-y-4", className)}>
      {step === "email" ? (
        <>
          <div className="space-y-3">
            <Button onClick={() => signInOAuth("github")} glow disabled={pending} size="lg" className="w-full">
              {pending && redirecting ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
              Continue with GitHub
            </Button>
            <Button onClick={() => signInOAuth("google")} variant="outline" disabled={pending} size="lg" className="w-full">
              <GoogleIcon className="size-4" />
              Continue with Google
            </Button>
            {showSso && (
              <Button onClick={onSsoOpen} variant="outline" disabled={pending} size="lg" className="w-full">
                <ShieldCheck className="size-4" />
                Sign in with SSO
              </Button>
            )}
          </div>

          <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span>or with email</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <form onSubmit={onEmailSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Work email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={pending}
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
            <Button type="submit" variant="outline" disabled={pending || !email} size="lg" className="w-full">
              {pending && !redirecting ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
              Continue with email
            </Button>
          </form>
        </>
      ) : (
        <form onSubmit={onVerify} className="space-y-3">
          <div className="text-sm">
            <p className="font-medium text-[var(--text)]">Check your email</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Enter the 6-digit code we sent to{" "}
              <span className="font-medium text-[var(--text)]">{sentTo}</span>, or click the link in the email.
            </p>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--text-muted)]">Verification code</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              autoFocus
              disabled={pending}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-center text-lg font-semibold tracking-[0.4em] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            />
          </label>
          <Button type="submit" glow disabled={pending || code.length < 6} size="lg" className="w-full">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Verify and continue
          </Button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={backToEmail}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ArrowLeft className="size-3" /> Use a different email
            </button>
            <button
              type="button"
              onClick={() => void sendOtp()}
              disabled={pending}
              className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
            >
              Resend code <ArrowRight className="size-3" />
            </button>
          </div>
        </form>
      )}

      {/* Managed CAPTCHA - invisible until a challenge is needed. Mounted in
          both steps so a resend can mint a fresh token. */}
      {config.captchaEnabled && (
        <Turnstile
          siteKey={config.turnstileSiteKey}
          onToken={onCaptchaToken}
          resetNonce={captchaNonce}
          onError={() => {
            awaitingCaptcha.current = false;
            setPending(false);
            setError("Verification check failed to load. Refresh and try again.");
          }}
        />
      )}

      {notice && (
        <p className="text-center text-sm text-[var(--text-muted)]">
          {redirecting && <Loader2 className="mr-1 inline size-3 animate-spin" />}
          {notice}
        </p>
      )}
      {error && <p role="alert" className="text-center text-sm text-[var(--danger)]">{error}</p>}

      <p className="text-center text-[10px] text-[var(--text-subtle)]">
        {mode === "signup" ? "Free for one repo. " : ""}No password, ever. We email you a one-time code.
      </p>
    </div>
  );
}
