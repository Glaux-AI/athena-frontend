"use client";

/**
 * /onboarding/[org_slug] - first-run wizard for a freshly-created org.
 *
 * Spine is the BE-canonical 5-step set returned by `GET /v1/orgs/{id}/onboarding`:
 *   1. connect_scm        - connect GitHub (server-side OAuth, §5.29.1)
 *   2. create_domain  - name your first feature area
 *   3. attach_repo        - pick a repo from your SCM
 *   4. define_roles       - optional: create custom roles for the team
 *   5. first_run          - kick off a chat / agent run
 *
 * The BE auto-derives step status from real data (integrations / domains /
 * domain_repos / runs counts), so a user who already did one of these in
 * another tab sees it pre-checked when they reload.
 *
 * Optional admin tasks (claim domain, configure SSO, invite teammates) are
 * surfaced as secondary deep-links to `/settings/*`; they have no
 * onboarding-state row and are reachable any time.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Github,
  GitFork,
  Globe,
  Loader2,
  PlayCircle,
  Shield,
  ShieldCheck,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { Stack, Cluster } from "@/components/layout/primitives";
import { OnboardingProgress } from "@/components/onboarding/onboarding-progress";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type OnboardingState, type OrgRole } from "@/lib/api/client";
import { config } from "@/lib/config";
import { cn } from "@/lib/cn";

type StepId = "connect_scm" | "create_domain" | "attach_repo" | "define_roles" | "first_run";
const STEP_ORDER: readonly StepId[] = ["connect_scm", "create_domain", "attach_repo", "define_roles", "first_run"] as const;

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const params = useParams<{ org_slug: string }>();
  const orgSlug = params?.org_slug ?? "";
  const router = useRouter();
  const search = useSearchParams();
  const { me, activeOrgId, setActiveOrgId } = useSession();

  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Resolve org from slug → id; switch active org if needed so api.* uses
  // the right `X-Athena-Org-Id`.
  const targetOrg = useMemo(
    () => me?.memberships.find((m) => m.orgSlug === orgSlug) ?? null,
    [me, orgSlug],
  );

  useEffect(() => {
    if (!targetOrg) return;
    if (activeOrgId !== targetOrg.orgId) setActiveOrgId(targetOrg.orgId);
  }, [targetOrg, activeOrgId, setActiveOrgId]);

  const refresh = useCallback(async () => {
    if (!targetOrg) return;
    setLoading(true);
    try {
      const s = await api.onboarding.state(targetOrg.orgId);
      setState(s);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load onboarding state.");
    } finally {
      setLoading(false);
    }
  }, [targetOrg]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Pick the active step: explicit ?step= query wins; otherwise first
  // non-done step; otherwise the last step.
  const activeStep: StepId = useMemo(() => {
    const fromUrl = search.get("step") as StepId | null;
    if (fromUrl && STEP_ORDER.includes(fromUrl)) return fromUrl;
    if (!state) return "connect_scm";
    const firstPending = STEP_ORDER.find(
      (id) => state.steps.find((s) => s.id === id)?.status !== "done",
    );
    return firstPending ?? "first_run";
  }, [search, state]);

  const setStep = useCallback(
    (id: StepId) => {
      const sp = new URLSearchParams(search.toString());
      sp.set("step", id);
      router.replace(`/onboarding/${encodeURIComponent(orgSlug)}?${sp.toString()}`);
    },
    [orgSlug, router, search],
  );

  const goNext = useCallback(() => {
    const idx = STEP_ORDER.indexOf(activeStep);
    if (idx < 0 || idx >= STEP_ORDER.length - 1) return;
    setStep(STEP_ORDER[idx + 1] as StepId);
  }, [activeStep, setStep]);

  const skipStep = useCallback(
    async (id: StepId) => {
      if (!targetOrg) return;
      setPending(true);
      try {
        // §5.29.4 - explicit-mark skipped steps so the BE flags them as
        // done even when the auto-derivation can't see it (e.g. user
        // wants to do connect_scm later from /settings).
        const s = await api.onboarding.completeStep(targetOrg.orgId, id);
        setState(s);
        goNext();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Couldn't skip step.");
      } finally {
        setPending(false);
      }
    },
    [targetOrg, goNext],
  );

  const onFinish = useCallback(() => {
    router.replace("/dashboard");
  }, [router]);

  // Auto-redirect to /dashboard once everything is done AND the user
  // clicked the explicit finish flow. We don't auto-leave - they may
  // want to revisit a step.
  const allDone = state?.current === "complete";

  if (!targetOrg) {
    return (
      <CenteredCard>
        <Stack gap="3">
          <h1 className="text-xl font-semibold">Organization not found</h1>
          <p className="text-sm text-[var(--text-muted)]">
            You&apos;re not a member of an org with slug{" "}
            <code className="font-mono">{orgSlug}</code>. Try the org switcher in the top bar.
          </p>
          <Cluster gap="2">
            <Button asChild variant="outline"><Link href="/dashboard">Go to dashboard</Link></Button>
            <Button asChild><Link href="/orgs/new">Create an organization</Link></Button>
          </Cluster>
        </Stack>
      </CenteredCard>
    );
  }

  return (
    <Stack gap="6">
      <OnboardingProgress current={3} />
      <div className="relative isolate overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] px-5 py-6 shadow-[var(--shadow-1)]">
        <AmbientBackground variant="subtle" />
        <Stack gap="1">
          <GradientText as="h1" className="text-2xl font-semibold tracking-tight">
            Set up {targetOrg.orgName}
          </GradientText>
          <p className="text-sm text-[var(--text-muted)]">
            Connect a repo and kick off your first run - a few quick steps.{" "}
            <Link href="/settings/billing" className="underline">Manage plan &amp; billing</Link>.
            {allDone && <> All set - <button onClick={onFinish} className="underline">take me to the dashboard</button>.</>}
          </p>
        </Stack>
      </div>

      {error && (
        <Card className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
          <p className="text-sm text-[var(--danger-ink)]">{error}</p>
        </Card>
      )}

      <Stepper steps={state?.steps ?? []} active={activeStep} onPick={setStep} />

      {loading ? (
        <StepSkeleton />
      ) : (
        <StepBody
          orgSlug={orgSlug}
          orgId={targetOrg.orgId}
          stepId={activeStep}
          status={state?.steps.find((s) => s.id === activeStep)?.status ?? "pending"}
          onAdvance={goNext}
          onSkip={() => void skipStep(activeStep)}
          pending={pending}
          onRefresh={() => void refresh()}
        />
      )}

      <SecondaryLinks />

      {allDone && (
        <Cluster gap="2" justify="end">
          <Button onClick={onFinish}>
            Take me to the dashboard
            <ArrowRight className="size-4" />
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------- Stepper

function Stepper({
  steps,
  active,
  onPick,
}: {
  steps: OnboardingState["steps"];
  active: StepId;
  onPick: (id: StepId) => void;
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {STEP_ORDER.map((id, idx) => {
        const s = steps.find((x) => x.id === id);
        const done = s?.status === "done";
        const isActive = id === active;
        return (
          <li key={id}>
            <button
              type="button"
              onClick={() => onPick(id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border p-3 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-out",
                isActive ? "border-[var(--primary)] bg-[var(--primary-soft)] shadow-[var(--shadow-1)]"
                  : done   ? "border-[var(--success)] bg-[var(--success-soft)]"
                  :          "border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:shadow-[var(--shadow-1)]",
              )}
            >
              <span className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done    ? "bg-[var(--success)] text-[var(--primary-fg)]"
                : isActive ? "bg-[var(--primary)] text-[var(--primary-fg)]"
                :            "bg-[var(--surface-2)] text-[var(--text-muted)]",
              )}>
                {done ? <Check className="size-3.5" /> : idx + 1}
              </span>
              <Stack gap="0" className="min-w-0">
                <span className="truncate text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]">
                  Step {idx + 1}
                </span>
                <span className="truncate text-sm font-medium">{s?.title ?? id}</span>
              </Stack>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// -------------------------------------------------------------- Step bodies

function StepBody({
  orgId,
  orgSlug,
  stepId,
  status,
  onAdvance,
  onSkip,
  pending,
  onRefresh,
}: {
  orgId: string;
  orgSlug: string;
  stepId: StepId;
  status: string;
  onAdvance: () => void;
  onSkip: () => void;
  pending: boolean;
  onRefresh: () => void;
}) {
  const done = status === "done";
  switch (stepId) {
    case "connect_scm":
      return (
        <ConnectScmStep orgId={orgId} done={done} onAdvance={onAdvance} onSkip={onSkip} pending={pending} />
      );
    case "create_domain":
      return (
        <CreateDomainStep
          done={done}
          onCreated={() => { onRefresh(); onAdvance(); }}
          onSkip={onSkip}
          pending={pending}
        />
      );
    case "attach_repo":
      return (
        <AttachRepoStep orgSlug={orgSlug} done={done} onAdvance={onAdvance} onSkip={onSkip} pending={pending} />
      );
    case "define_roles":
      return (
        <DefineRolesStep
          orgId={orgId}
          done={done}
          onCreated={() => { onRefresh(); onAdvance(); }}
          onAdvance={onAdvance}
          onSkip={onSkip}
          pending={pending}
        />
      );
    case "first_run":
      return (
        <FirstRunStep done={done} orgSlug={orgSlug} onAdvance={onAdvance} onSkip={onSkip} pending={pending} />
      );
    default:
      return null;
  }
  // `orgId` parameter is consumed below by the child steps that need it
  // via the api client (which reads X-Athena-Org-Id from session).
  void orgId;
}

function ConnectScmStep({
  orgId,
  done,
  onAdvance,
  onSkip,
  pending,
}: {
  orgId: string;
  done: boolean;
  onAdvance: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  const [starting, setStarting] = useState(false);
  const onConnect = async () => {
    if (config.isMock) {
      toast.info("OAuth is disabled in demo mode.");
      return;
    }
    setStarting(true);
    try {
      // Single, generic OAuth flow (shared with /settings/integrations) so
      // there's one callback URL to register and MCP gets provisioned on
      // connect. `return_to` puts the callback into top-level-redirect mode.
      const { authorize_url } = await api.integrations.oauth.initiate(
        orgId,
        "github",
        "source_control",
        { return_to: window.location.pathname + window.location.search },
      );
      window.location.assign(authorize_url);
    } catch (e) {
      setStarting(false);
      toast.error(e instanceof ApiError ? e.message : "Couldn't start GitHub OAuth.");
    }
  };
  return (
    <StepCard icon={<Github className="size-5" />} title="Connect a source-control provider" done={done}>
      <p className="text-sm text-[var(--text-muted)]">
        Athena needs read access to a repo before it can plan or build anything.
        The OAuth token is exchanged server-to-server and stored encrypted -
        it never touches your browser.
      </p>
      <Cluster gap="2" align="center">
        <Button onClick={() => void onConnect()} disabled={starting || done}>
          {starting ? <Loader2 className="size-4 animate-spin" /> : <Github className="size-4" />}
          {done ? "Connected" : starting ? "Redirecting to GitHub…" : "Connect GitHub"}
        </Button>
        <Button variant="outline" asChild>
          <Link href="/settings/integrations">Other providers</Link>
        </Button>
        {done ? (
          <Button variant="ghost" onClick={onAdvance}>Continue<ArrowRight className="size-4" /></Button>
        ) : (
          <Button variant="ghost" onClick={onSkip} disabled={pending}>
            Skip for now
          </Button>
        )}
      </Cluster>
    </StepCard>
  );
}

function CreateDomainStep({
  done,
  onCreated,
  onSkip,
  pending,
}: {
  done: boolean;
  onCreated: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;
    setBusy(true);
    try {
      // exactOptionalPropertyTypes is on - only include `description`
      // when it's a non-empty string.
      const body: { slug: string; name: string; description?: string } = { slug, name };
      if (desc) body.description = desc;
      await api.domains.create(body);
      toast.success(`Domain "${name}" created.`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create domain.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard icon={<Sparkles className="size-5" />} title="Create your first domain" done={done}>
      <p className="text-sm text-[var(--text-muted)]">
        A <strong>domain</strong> is a feature area Athena owns end-to-end -
        like &quot;payments&quot; or &quot;checkout&quot;. Pick one to start.
      </p>
      <form onSubmit={onSubmit}>
        <Stack gap="3">
          <label className="block text-sm">
            <span className="mb-1 inline-block font-medium">Name</span>
            <input
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slug) setSlug(slugify(e.target.value));
              }}
              placeholder="Payments"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm transition-[border-color,box-shadow] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              disabled={done}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 inline-block font-medium">Slug</span>
            <input
              required
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="payments"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm transition-[border-color,box-shadow] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              disabled={done}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 inline-block font-medium">Description (optional)</span>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="What this domain owns."
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm transition-[border-color,box-shadow] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              disabled={done}
            />
          </label>
          <Cluster gap="2">
            {done ? (
              <Button variant="ghost" onClick={onCreated} type="button">
                Continue<ArrowRight className="size-4" />
              </Button>
            ) : (
              <>
                <Button type="submit" disabled={busy || !name || !slug}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  Create domain
                </Button>
                <Button type="button" variant="ghost" onClick={onSkip} disabled={pending}>
                  Skip for now
                </Button>
              </>
            )}
          </Cluster>
        </Stack>
      </form>
    </StepCard>
  );
}

function AttachRepoStep({
  done,
  onAdvance,
  onSkip,
  pending,
}: {
  orgSlug: string;
  done: boolean;
  onAdvance: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  /* Deep-link straight to the most-recently-created domain's Repos
   * tab with `?attach=1` so the dialog auto-opens - saves the user a
   * click vs landing on the domain list (§5.29.11 / S7.7). */
  const [target, setTarget] = useState<string>("/domains");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = await api.domains.list();
        if (cancelled) return;
        const active = caps.filter((c) => !c.archived_at);
        const pick = active[active.length - 1] ?? active[0];
        if (pick) {
          setTarget(`/domains/${encodeURIComponent(pick.id)}?tab=repos&attach=1`);
        }
      } catch {
        // Fall back to the domains list - graceful degradation.
      }
    })();
    return () => { cancelled = true; };
  }, []);
  return (
    <StepCard icon={<GitFork className="size-5" />} title="Attach a repo to that domain" done={done}>
      <p className="text-sm text-[var(--text-muted)]">
        Pick a repo from your connected GitHub account. Athena will ingest
        it on attach - the row appears with a live progress chip.
      </p>
      <Cluster gap="2">
        <Button asChild>
          <Link href={target}>{done ? "Open domain" : "Pick a repo"}</Link>
        </Button>
        {done ? (
          <Button variant="ghost" onClick={onAdvance}>Continue<ArrowRight className="size-4" /></Button>
        ) : (
          <Button variant="ghost" onClick={onSkip} disabled={pending}>Skip for now</Button>
        )}
      </Cluster>
    </StepCard>
  );
}

function DefineRolesStep({
  orgId,
  done,
  onCreated,
  onAdvance,
  onSkip,
  pending,
}: {
  orgId: string;
  done: boolean;
  onCreated: () => void;
  onAdvance: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  /* Optional step - every org already ships with an editable starter
   * set (admin / engineer / reviewer / …). This quick form creates a
   * custom role by copying an existing role's permissions; fine-tuning
   * happens in Settings → Roles & permissions. */
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [name, setName] = useState("");
  const [basedOn, setBasedOn] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.roles.list(orgId)
      .then((r) => {
        if (cancelled) return;
        setRoles(r);
        if (r.length > 0 && !basedOn) {
          setBasedOn(r.find((x) => x.is_default_for_invite)?.id ?? r[0]!.id);
        }
      })
      .catch(() => { /* roles endpoint unavailable - links still work */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per org
  }, [orgId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const template = roles.find((r) => r.id === basedOn);
      await api.roles.create(orgId, {
        name: name.trim(),
        permissions: template?.permissions ?? [],
      });
      toast.success(`Role "${name.trim()}" created - fine-tune it under Settings → Roles.`);
      setName("");
      onCreated();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create role.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepCard icon={<ShieldCheck className="size-5" />} title="Set up roles & permissions (optional)" done={done}>
      <p className="text-sm text-[var(--text-muted)]">
        Your org already has an editable starter set -{" "}
        {roles.length > 0
          ? roles.map((r) => r.name).slice(0, 5).join(", ")
          : "admin, engineer, reviewer, and more"}
        . Add a custom role now (start from an existing one and tweak later),
        or skip - you can do this anytime.
      </p>
      <form onSubmit={onSubmit}>
        <Stack gap="3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
            <label className="block text-sm">
              <span className="mb-1 inline-block font-medium">Role name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Release captain"
                maxLength={64}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm transition-[border-color,box-shadow] focus:border-[var(--ring)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 inline-block font-medium">Start from</span>
              <select
                value={basedOn}
                onChange={(e) => setBasedOn(e.target.value)}
                disabled={roles.length === 0}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.permissions.length} permissions)
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Cluster gap="2" align="center">
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
              Create role
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/roles">Open full editor</Link>
            </Button>
            {done ? (
              <Button variant="ghost" onClick={onAdvance} type="button">Continue<ArrowRight className="size-4" /></Button>
            ) : (
              <Button variant="ghost" onClick={onSkip} disabled={pending} type="button">Skip for now</Button>
            )}
          </Cluster>
        </Stack>
      </form>
    </StepCard>
  );
}

function FirstRunStep({
  done,
  onAdvance,
  onSkip,
  pending,
}: {
  done: boolean;
  orgSlug: string;
  onAdvance: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <StepCard icon={<PlayCircle className="size-5" />} title="Kick off your first run" done={done}>
      <p className="text-sm text-[var(--text-muted)]">
        Ask Athena a question about the code, or queue a real run from the
        domain page. You&apos;ll see the agent&apos;s reasoning stream in
        real time.
      </p>
      <Cluster gap="2">
        <Button asChild>
          <Link href="/work">{done ? "Open tasks" : "Start a task"}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/chat">Open chat</Link>
        </Button>
        {done ? (
          <Button variant="ghost" onClick={onAdvance}>Continue<ArrowRight className="size-4" /></Button>
        ) : (
          <Button variant="ghost" onClick={onSkip} disabled={pending}>Skip for now</Button>
        )}
      </Cluster>
    </StepCard>
  );
}

// --------------------------------------------------------------- Helpers

function StepCard({
  icon,
  title,
  done,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      variant="elevated"
      className={cn(done && "border-[var(--success)] bg-[var(--success-soft)]")}
    >
      <Stack gap="3">
        <Cluster
          gap="2"
          align="center"
          className="border-b border-[var(--border)] pb-3"
        >
          {done ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--success)] text-[var(--success-fg)]">
              <CheckCircle2 className="size-4" />
            </span>
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
              {icon}
            </span>
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{title}</h2>
        </Cluster>
        {children}
      </Stack>
    </Card>
  );
}

function StepSkeleton() {
  return (
    <Card variant="elevated" aria-busy="true" aria-label="Loading step">
      <Stack gap="3">
        <div className="h-4 w-48 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-3 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-3 w-3/4 animate-pulse rounded-md bg-[var(--surface-2)]" />
        <div className="h-8 w-40 animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    </Card>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="w-[min(560px,calc(100%-2rem))]">{children}</Card>
    </div>
  );
}

function SecondaryLinks() {
  return (
    <Card className="border-dashed">
      <Stack gap="2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--text-subtle)]">
          Admin (optional - you can do these anytime)
        </h2>
        <div className="flex flex-wrap gap-2">
          <LinkChip href="/settings/email-domains" icon={<Globe    className="size-3.5" />} label="Claim a domain" />
          <LinkChip href="/settings/sso"          icon={<Shield   className="size-3.5" />} label="Configure SSO" />
          <LinkChip href="/settings/members"      icon={<UserPlus className="size-3.5" />} label="Invite teammates" />
        </div>
      </Stack>
    </Card>
  );
}

function LinkChip({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-2)]"
    >
      {icon}
      {label}
    </Link>
  );
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

// Silence the "imported but unused" warning for the legend icons that
// live only as <icon> children of <StepCard>; some are forwarded
// indirectly via JSX. Keeps the imports stable as steps evolve.
void Circle;
