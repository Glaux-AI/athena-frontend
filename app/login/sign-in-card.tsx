"use client";

import Link from "next/link";

import { Card } from "@/components/ui/card";
import { LiveSignIn } from "@/components/auth/live-sign-in";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";

export function SignInCard({
  id = "signin",
  onSsoOpen,
  notice,
  returnTo,
  signupQuery,
  className,
}: {
  id?: string;
  onSsoOpen: () => void;
  notice: string | null;
  /** Post-sign-in destination, forwarded to the OAuth/OTP flow. */
  returnTo: string;
  signupQuery: string;
  className?: string;
}) {
  return (
    <Card
      id={id}
      variant="glass"
      className={cn(
        "w-full max-w-[440px] p-6 shadow-[var(--shadow-3)] lg:p-7",
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
          {config.isMock
            ? "Mock mode - any email works."
            : "Continue with GitHub, Google, or a one-time email code."}
        </p>
      </div>

      <LiveSignIn mode="login" returnTo={returnTo} onSsoOpen={onSsoOpen} />

      <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
        New to Athena?{" "}
        <Link href={`/signup${signupQuery}`} className="font-medium text-[var(--primary)] underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-micro text-[var(--text-subtle)]">
        By continuing you agree to our{" "}
        <a className="underline hover:text-[var(--text)]" href="/legal/terms">Terms</a> and{" "}
        <a className="underline hover:text-[var(--text)]" href="/legal/privacy">Privacy Policy</a>.
      </p>
    </Card>
  );
}
