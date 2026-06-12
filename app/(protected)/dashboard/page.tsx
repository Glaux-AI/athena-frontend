"use client";

/**
 * /dashboard — Home.
 *
 * The default landing page after sign-in, redesigned around a single CTA
 * (2026-06-12): describe what you want and Athena takes it from there. One
 * centered stage — Sophia, a greeting, the ask composer, example prompts —
 * with a compact four-stat dock pinned to the bottom (active tasks / inbox /
 * MTD spend / domains). The old six-surface dashboard (KPI grid + four list
 * cards) is gone; every stat deep-links to its full page instead.
 *
 * Sending hands the draft to /chat in memory (`lib/chat/draft-handoff.ts`),
 * where it starts a new org-scoped thread and sends immediately. The example
 * prompts mirror /chat's own — only things chat supports today (scope Q&A
 * with citations, recent-changes context, drafting a PRD). Task creation
 * stays available via the quiet "New task" chip + the Cmd-K palette event.
 *
 * In demo mode (`config.isMock`) compose is disabled and a banner replaces
 * the composer — same treatment as /chat.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  CircleDollarSign,
  FolderGit2,
  Github,
  Inbox,
  Plus,
  Rocket,
  Sparkles,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { Stack, Cluster } from "@/components/layout/primitives";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { useMascotStore } from "@/lib/stores/mascot";
import { useSession } from "@/lib/session/SessionProvider";
import { config } from "@/lib/config";
import {
  api, ApiError,
  type Task, type InboxItem, type Domain, type CostSummary,
  type OnboardingState,
} from "@/lib/api/client";
import { listIntegrations, type IntegrationOut } from "@/lib/api/integrations";
import { setChatDraftHandoff } from "@/lib/chat/draft-handoff";
import { NewTaskDialog } from "@/components/work/new-task-dialog";
import { cn } from "@/lib/cn";

/** Example prompts seed the composer — kept to what /chat supports today
 *  (mirrors EXAMPLE_PROMPTS in app/(protected)/chat/page.tsx, org scope):
 *  #1 → the kb-navigation retrieval ladder + blueprints; #2 →
 *  recent_code_changes (drill-down live commit history, chat.v23) +
 *  query_org(activity); #3 → KB-grounded drafting + propose_task. Change
 *  both files together. */
const EXAMPLE_PROMPTS = [
  "What does this codebase do, and where does the core logic live?",
  "What changed in our code recently?",
  "Draft a short PRD for an improvement you'd prioritize.",
];

export default function DashboardPage() {
  const router = useRouter();
  const { me, activeOrgId } = useSession();
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  // Readiness §5.28 row 1804 — null until the integrations call resolves so
  // the CTA doesn't flash on first paint, then `true`/`false` based on whether
  // the org has an active GitHub row.
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [draft, setDraft] = useState("");

  const readOnly = config.isMock;

  useEffect(() => { setScreenDefault("idle"); }, [setScreenDefault]);

  // The Cmd-K palette dispatches this event when a user picks "Start a new task".
  useEffect(() => {
    const open = () => setOpenNew(true);
    document.addEventListener("athena:new-task", open);
    return () => document.removeEventListener("athena:new-task", open);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [taskList, inboxPage, domainList, costSummary, onboardingState, integrations] = await Promise.all([
          // Best-effort: a tasks failure shouldn't blank the whole home (and
          // /v1/tasks has no mock-mode parity by design) — the dock just
          // shows 0 active tasks while everything else stays live.
          api.tasks.list().catch(() => [] as Task[]),
          api.inbox.list({ limit: 50 }),
          api.domains.list(),
          api.cost.summary().catch(() => null),
          // §5.29.4 — surface a banner when onboarding isn't complete.
          // Best-effort: a 403 (non-owner/admin) just leaves the banner off.
          activeOrgId ? api.onboarding.state(activeOrgId).catch(() => null) : Promise.resolve(null),
          // Readiness §5.28 row 1804 — list integrations so the "Connect
          // GitHub" CTA only renders when GitHub is not yet connected. A
          // failure here is non-fatal: we fall back to "not connected" so the
          // CTA appears rather than the user being stuck with no obvious next
          // step. Skip the call until we know the active org — the canonical
          // `/v1/orgs/{orgId}/integrations` route requires it on the path.
          activeOrgId
            ? listIntegrations(activeOrgId).catch(
                () => [] as readonly IntegrationOut[],
              )
            : Promise.resolve([] as readonly IntegrationOut[]),
        ]);
        if (cancelled) return;
        setTasks(taskList);
        setInbox(inboxPage.items);
        setDomains(domainList);
        setCost(costSummary);
        setOnboarding(onboardingState);
        setGithubConnected(
          integrations.some(
            (i) =>
              i.provider === "github" &&
              (i.status === "active" || i.status === "connected"),
          ),
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [activeOrgId]);

  const onCreated = (task: Task) => {
    setOpenNew(false);
    router.push(`/work/${task.id}`);
  };

  // Hand the draft to /chat in memory — it starts a new org-scoped thread
  // there and sends immediately. No URL param, no client-side persistence.
  const onAsk = () => {
    const content = draft.trim();
    if (!content || readOnly) return;
    setChatDraftHandoff(content);
    router.push("/chat");
  };

  const activeTasks = tasks.filter((t) => t.status === "in_progress" || t.status === "in_review").length;
  const unread = inbox.filter((i) => !i.read).length;
  const firstName = me?.displayName.split(" ")[0] ?? null;

  // §5.29.4 — only owners/admins see the onboarding banner; engineers don't
  // own the org-bootstrap path and shouldn't be redirected away.
  const activeOrgSlug = me?.memberships.find((m) => m.orgId === activeOrgId)?.orgSlug ?? null;
  const myRole = me?.memberships.find((m) => m.orgId === activeOrgId)?.role ?? null;
  const showOnboardingBanner =
    onboarding !== null &&
    onboarding.current !== "complete" &&
    activeOrgSlug !== null &&
    (myRole === "owner" || myRole === "admin");

  const stats: StatProps[] = [
    { icon: Sparkles, label: "Active tasks", value: activeTasks.toString(), href: "/work" },
    { icon: Inbox, label: "Waiting on you", value: unread.toString(), href: "/inbox", tone: unread > 0 ? "warning" : "neutral" },
    {
      icon: CircleDollarSign,
      label: "MTD spend",
      // BE /v1/cost/summary returns the slim CostSummaryOut shape today
      // (`total_cost_usd`, no budget fields). The richer `spend_usd` wire
      // shape is the §7.10 Phase-2 follow-up; fall back to "—" until then.
      value: cost && typeof cost.spend_usd === "number" ? `$${cost.spend_usd.toLocaleString()}` : "—",
      href: "/cost",
    },
    { icon: FolderGit2, label: "Domains", value: domains.length.toString(), href: "/domains" },
  ];

  return (
    <>
      <div className="relative isolate flex min-h-[calc(100vh-7.5rem)] flex-col">
        <AmbientBackground variant="subtle" />

        {showOnboardingBanner && activeOrgSlug && (
          <div className="shrink-0 pb-4">
            <OnboardingBanner orgSlug={activeOrgSlug} onboarding={onboarding} />
          </div>
        )}

        {error && (
          <Card className="shrink-0 border-[var(--border-strong)] bg-[var(--danger-soft)]">
            <p className="text-sm text-[var(--danger-ink)]">{error}</p>
          </Card>
        )}

        {/* Centered stage — the one place to start. */}
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <Stack gap="5" className="w-full max-w-2xl items-center text-center">
            <OwlAvatar size={88} mood={draft.trim() ? "focused" : "waiting"} />
            <Stack gap="1" className="items-center">
              <GradientText as="h1" className="text-3xl font-semibold tracking-tight">
                What should we build{firstName ? `, ${firstName}` : ""}?
              </GradientText>
              <p className="max-w-md text-sm text-[var(--text-muted)]">
                Ask about any domain or your whole org — answers cite your sources, and Athena can
                spin a task out of the conversation.
              </p>
            </Stack>

            {readOnly ? (
              <div className="w-full rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                Demo mode — chat compose is disabled. Browse the precomputed conversations on the Chat page.
              </div>
            ) : (
              <>
                <AskComposer value={draft} onChange={setDraft} onSend={onAsk} />
                <Cluster gap="2" justify="center">
                  {EXAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDraft(p)}
                      className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setOpenNew(true)}
                    className="rounded-full border border-dashed border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  >
                    <Plus className="mr-1 inline size-3" />
                    New task
                  </button>
                </Cluster>
              </>
            )}

            {/* Readiness §5.28 row 1804 — surface a "Connect GitHub" CTA when
                the org has no active GitHub integration. Deep-links to
                /settings/integrations#github so the GitHub provider card
                scrolls into view (id="provider-github"). Suppressed during
                the integrations fetch + once a connection exists so it
                doesn't flash on first paint. */}
            {githubConnected === false && (
              <Cluster gap="2" align="center" justify="center">
                <span className="text-xs text-[var(--text-muted)]">
                  Bring your code into Athena to get grounded answers.
                </span>
                <Button asChild variant="outline" size="sm" data-testid="dashboard-connect-github-cta">
                  <Link href="/settings/integrations#github">
                    <Github className="size-4" />
                    Connect GitHub
                  </Link>
                </Button>
              </Cluster>
            )}
          </Stack>
        </div>

        {/* Stat dock — the glanceable numbers; each links to its full page. */}
        <div className="flex shrink-0 justify-center pb-1">
          <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
            {!loaded
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-[62px] animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
                    aria-hidden
                  />
                ))
              : !error && stats.map((s) => <StatCard key={s.href} {...s} />)}
          </div>
        </div>
      </div>

      <NewTaskDialog open={openNew} onOpenChange={setOpenNew} onCreated={onCreated} />
    </>
  );
}

/** The home ask composer — one bordered card: auto-growing textarea + send.
 *  Sends on Enter (Shift+Enter inserts a newline); the draft is handed to
 *  /chat where the conversation actually runs. */
function AskComposer({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);

  // Auto-grow: reset to measure, then grow to content height (capped).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const canSend = value.trim().length > 0;

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-2)]",
        "transition-[border-color,box-shadow] duration-200 ease-out",
        "focus-within:border-[var(--border-accent)] focus-within:shadow-[var(--shadow-3)] hover:border-[var(--border-strong)]",
      )}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !composingRef.current) {
            e.preventDefault();
            onSend();
          }
        }}
        onCompositionStart={() => (composingRef.current = true)}
        onCompositionEnd={() => (composingRef.current = false)}
        rows={1}
        placeholder="Describe a task, ask a question…"
        aria-label="Ask Athena"
        className="input-bare max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-base leading-relaxed outline-none placeholder:text-[var(--text-muted)]"
      />
      <div className="flex items-center px-2.5 pb-2.5 pt-1">
        <span className="px-1.5 text-left text-[11px] text-[var(--text-subtle)]">
          Answers cite your sources — and can become a task.
        </span>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send"
          title="Send (Enter)"
          className={cn(
            "ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            canSend
              ? "bg-[var(--primary)] text-[var(--primary-fg)] hover:opacity-90"
              : "bg-[var(--surface-3)] text-[var(--text-subtle)] disabled:cursor-not-allowed",
          )}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
}

interface StatProps {
  icon: typeof Sparkles;
  label: string;
  value: string;
  href: string;
  tone?: "warning" | "neutral" | undefined;
}

function StatCard({ icon: Icon, label, value, href, tone }: StatProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-[var(--shadow-1)]",
        "transition-[transform,box-shadow,border-color] duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-[var(--border-accent)] hover:shadow-[var(--shadow-2)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
      )}
    >
      <Cluster gap="2" align="center">
        <Icon className="size-3.5 shrink-0 text-[var(--text-subtle)]" />
        <span
          className={cn(
            "text-lg font-semibold tabular-nums tracking-tight",
            tone === "warning" && Number(value) > 0 && "text-[var(--warning)]",
          )}
        >
          {value}
        </span>
      </Cluster>
      <span className="block text-[11px] text-[var(--text-muted)]">{label}</span>
    </Link>
  );
}

/**
 * §5.29.4 — banner shown on the dashboard when the active org's onboarding
 * isn't complete (owner/admin only — engineers don't own the bootstrap path).
 * Visualises how many of the 4 canonical steps are done + deep-links to
 * the wizard at the right step.
 */
function OnboardingBanner({ orgSlug, onboarding }: { orgSlug: string; onboarding: OnboardingState }) {
  const done = onboarding.steps.filter((s) => s.status === "done").length;
  const total = onboarding.steps.length;
  return (
    <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
      <Cluster gap="3" align="center" justify="between">
        <Cluster gap="3" align="center">
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--shadow-1)]">
            <Rocket className="size-4" />
          </span>
          <Stack gap="0">
            <span className="text-sm font-semibold">Finish setting up your workspace</span>
            <span className="text-xs text-[var(--text-muted)]">
              {done} of {total} steps done · about {Math.max(1, total - done) * 2} minutes left
            </span>
          </Stack>
        </Cluster>
        <Button asChild variant="outline" size="sm">
          <Link href={`/onboarding/${encodeURIComponent(orgSlug)}`}>
            Continue setup
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </Cluster>
    </Card>
  );
}
