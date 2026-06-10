"use client";

import { type FormEvent } from "react";
import Link from "next/link";
import { Building2, Github, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";

export function SignInCard({
  id = "signin",
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onMockSubmit,
  onOneClickDemo,
  onSignInOAuth,
  onSsoOpen,
  pending,
  error,
  notice,
  signupQuery,
  className,
}: {
  id?: string;
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onMockSubmit: (e: FormEvent) => void;
  onOneClickDemo: () => void;
  onSignInOAuth: () => void;
  onSsoOpen: () => void;
  pending: boolean;
  error: string | null;
  notice: string | null;
  signupQuery: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "w-full max-w-[440px] rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-2)] lg:p-7",
        className,
      )}
    >
      {notice && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-sm text-[var(--warning-ink)]"
        >
          {notice}
        </div>
      )}

      <div className="mb-5">
        <h2 className="text-base font-semibold leading-tight">Sign in to Athena</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {config.isMock ? "Mock mode — any email works." : "We use your verified GitHub email."}
        </p>
      </div>

      {config.isMock ? (
        <div className="space-y-4">
          <form onSubmit={onMockSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Work email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder="you@company.com"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--text-muted)]">Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="(mock — any value)"
                className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
            <Button type="submit" glow disabled={pending || !email} size="lg" className="w-full">
              {pending && <Loader2 className="size-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          <div className="relative flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-subtle)]">
            <div className="h-px flex-1 bg-[var(--border)]" />
            <span>or</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <Button onClick={onOneClickDemo} disabled={pending} variant="outline" size="lg" className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Continue as Demo User
          </Button>
          {config.enterpriseSsoEnabled && (
            <Button onClick={onSsoOpen} disabled={pending} variant="outline" size="lg" className="w-full">
              <Building2 className="size-4" />
              Sign in with SSO
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Button onClick={onSignInOAuth} glow disabled={pending} size="lg" className="w-full">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
            Continue with GitHub
          </Button>
          {config.enterpriseSsoEnabled && (
            <Button onClick={onSsoOpen} disabled={pending} variant="outline" size="lg" className="w-full">
              <Building2 className="size-4" />
              Sign in with SSO
            </Button>
          )}
          <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2 text-[11px] text-[var(--text-muted)]">
            <ShieldCheck className="mr-1 inline size-3 text-[var(--success)]" />
            SSO inherited from your GitHub organization (Okta · Entra ID · Google Workspace · Auth0)
            {config.enterpriseSsoEnabled ? " — or use direct SSO above." : "."}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-[var(--danger)]">{error}</p>
      )}

      {!config.isMock && (
        <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
          New to Athena?{" "}
          <Link href={`/signup${signupQuery}`} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      )}
      <p className="mt-2 text-center text-[10px] text-[var(--text-subtle)]">
        By continuing you agree to our{" "}
        <a className="underline hover:text-[var(--text)]" href="/legal/terms">Terms</a> and{" "}
        <a className="underline hover:text-[var(--text)]" href="/legal/privacy">Privacy Policy</a>.
      </p>
    </div>
  );
}
