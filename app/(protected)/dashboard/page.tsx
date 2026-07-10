"use client";

/**
 * /dashboard - Home.
 *
 * The default landing page after sign-in, redesigned around a single CTA
 * (2026-06-12): describe what you want and Athena takes it from there. One
 * centered stage - Sophia, a greeting, the ask composer, example prompts -
 * with a compact four-stat dock pinned to the bottom (active tasks / inbox /
 * MTD spend / domains). The stage is full-bleed (negative margins cancel the
 * AppShell main padding) so the ambient background reaches the shell edges
 * with no dead frame around it.
 *
 * The composer is the SAME `<ChatComposer>` as /chat (hero sizing) with the
 * same effort + model pickers, persisted under the shared `"chat"` run-pref
 * scope - so the picks made here are exactly what the chat composer restores.
 * Its column mirrors /chat's composer column (`max-w-3xl px-4 sm:px-6`), and
 * sending plays a short exit motion - the stage fades while the card glides
 * to the bottom of the viewport, where /chat's composer lives - before the
 * draft is handed off in memory (`lib/chat/draft-handoff.ts`) and the route
 * changes. Reduced motion skips straight to navigation.
 *
 * In demo mode (`config.isMock`) compose is disabled and a banner replaces
 * the composer - same treatment as /chat.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Github,
  Inbox,
  ListTodo,
  Plus,
  Rocket,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Skeleton } from "@/components/ui/skeleton";
import { focusRing } from "@/components/ui/focus";
import { AmbientBackground } from "@/components/ui/ambient-background";
import { GradientText } from "@/components/ui/gradient-text";
import { EffortSelector } from "@/components/ui/effort-selector";
import { ModelSelector } from "@/components/ui/model-selector";
import { AgentSelector } from "@/components/ui/agent-selector";
import { Stack, Cluster } from "@/components/layout/primitives";
import { OwlAvatar } from "@/components/mascot/owl-avatar";
import {
  ChatComposer,
  COMPOSER_PICKER_CLASS,
} from "@/components/chat/chat-composer";
import {
  AttachmentChips,
  useAttachmentDrafts,
} from "@/components/ui/attachment-picker";
import { ComposerActionsMenu } from "@/components/ui/composer-actions";
import { useMascotStore } from "@/lib/stores/mascot";
import { useSession } from "@/lib/session/SessionProvider";
import { config } from "@/lib/config";
import {
  api,
  ApiError,
  type Agent,
  type Task,
  type InboxItem,
  type Domain,
  type CostSummary,
  type OnboardingState,
  type EnabledModel,
  type ModelSelection,
} from "@/lib/api/client";
import { listIntegrations, type IntegrationOut } from "@/lib/api/integrations";
import { setChatDraftHandoff } from "@/lib/chat/draft-handoff";
import {
  restoreModelSelection,
  storeModel,
  usePersistedEffort,
} from "@/lib/prefs/run-prefs";
import { NewTaskDialog } from "@/components/work/new-task-dialog";
import { cn } from "@/lib/cn";

/** Example prompts seed the composer - kept to what /chat supports today
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

/** How long the exit motion runs before the route changes (ms) - the full
 *  300ms transform transition on the composer column. Navigating earlier
 *  put the route swap's render work mid-glide and visibly dropped frames;
 *  with /chat prefetched on mount the swap right after the glide is cheap. */
const EXIT_MS = 300;

export default function DashboardPage() {
  const router = useRouter();
  const { me, activeOrgId } = useSession();
  const setScreenDefault = useMascotStore((s) => s.setScreenDefault);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  // Readiness §5.28 row 1804 - null until the integrations call resolves so
  // the CTA doesn't flash on first paint, then `true`/`false` based on whether
  // the org has an active GitHub row.
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [draft, setDraft] = useState("");
  // The same effort + model pair the /chat composer uses - shared "chat"
  // run-pref scope, so a pick made here is what chat restores after handoff.
  const [effort, setEffort] = usePersistedEffort("chat");
  // Per-turn "Web search" toggle from the composer "+" menu; rides the handoff.
  const [webSearch, setWebSearch] = useState(false);
  const [models, setModels] = useState<EnabledModel[]>([]);
  const [model, setModel] = useState<ModelSelection | null>(null);
  // Custom agents (Agent Registry) the user can pick for the first /chat turn;
  // the pick rides the home->chat handoff. Loaded on its own so it never blocks
  // the dashboard's primary data.
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.agents
      .list()
      .then((a) => { if (!cancelled) setAgents(a); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const subscriptionGrounded = me?.features.subscriptionMcpBridge ?? false;
  // Images only when the picked model supports vision; documents always. The
  // ready ids + the model/effort pick ride the handoff to /chat (race-free).
  const selectedSpec = model
    ? models.find(
        (mm) => mm.provider === model.provider && mm.id === model.model,
      )
    : undefined;
  const canAttachImages = selectedSpec?.supports_vision ?? false;
  const {
    addFiles: addAttachments,
    remove: removeAttachment,
    clear: clearAttachments,
    drafts: attachmentDrafts,
    readyIds: attachmentReadyIds,
    pending: attachPending,
    hasReadyImage,
  } = useAttachmentDrafts({ canAttachImages });

  const onPasteAttach = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs = Array.from(e.clipboardData?.files ?? []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (imgs.length) addAttachments(imgs);
  };
  // Exit motion: the stage fades while the composer column glides down to
  // where /chat's composer sits, then the route changes.
  const [leaving, setLeaving] = useState(false);
  const [exitDelta, setExitDelta] = useState(0);
  const composerColRef = useRef<HTMLDivElement>(null);

  const readOnly = config.isMock;

  useEffect(() => {
    setScreenDefault("idle");
  }, [setScreenDefault]);

  // Warm the chat route so the post-glide navigation swaps instantly - the
  // ask composer's whole point is to land there (no-op in dev, where routes
  // compile on demand).
  useEffect(() => {
    router.prefetch("/chat");
  }, [router]);

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
        const [
          taskList,
          inboxPage,
          domainList,
          costSummary,
          onboardingState,
          integrations,
          modelList,
        ] = await Promise.all([
          // Best-effort: a tasks failure shouldn't blank the whole home (and
          // /v1/tasks has no mock-mode parity by design) - the dock just
          // shows 0 active tasks while everything else stays live.
          api.tasks.list().catch(() => [] as Task[]),
          api.inbox.list({ limit: 50 }),
          api.domains.list(),
          api.cost.summary().catch(() => null),
          // §5.29.4 - surface a banner when onboarding isn't complete.
          // Best-effort: a 403 (non-owner/admin) just leaves the banner off.
          activeOrgId
            ? api.onboarding.state(activeOrgId).catch(() => null)
            : Promise.resolve(null),
          // Readiness §5.28 row 1804 - list integrations so the "Connect
          // GitHub" CTA only renders when GitHub is not yet connected. A
          // failure here is non-fatal: we fall back to "not connected" so the
          // CTA appears rather than the user being stuck with no obvious next
          // step. Skip the call until we know the active org - the canonical
          // `/v1/orgs/{orgId}/integrations` route requires it on the path.
          activeOrgId
            ? listIntegrations(activeOrgId).catch(
                () => [] as readonly IntegrationOut[],
              )
            : Promise.resolve([] as readonly IntegrationOut[]),
          // The composer's model picker - same enabled set + default rule as
          // /chat (remembered pick wins; otherwise a workspace-capable model).
          api.models.enabled().catch(() => [] as EnabledModel[]),
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
        const enabled = modelList.filter((m) => m.enabled);
        setModels(enabled);
        const restored = restoreModelSelection("chat", enabled);
        const preferred =
          enabled.find((m) => m.source !== "subscription") ?? enabled[0];
        if (restored) setModel(restored);
        else if (preferred)
          setModel({
            provider: preferred.provider,
            model: preferred.id,
            source: preferred.source,
          });
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof ApiError ? e.message : "Failed to load dashboard",
          );
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId]);

  const onCreated = (task: Task) => {
    setOpenNew(false);
    router.push(`/work/${task.id}`);
  };

  // Hand the draft to /chat in memory - it starts a new org-scoped thread
  // there and sends immediately. No URL param, no client-side persistence.
  // The exit motion plays first (skipped under reduced motion).
  const onAsk = () => {
    const content = draft.trim();
    if (readOnly || leaving) return;
    if (!content && attachmentReadyIds.length === 0) return;
    if (attachPending || (hasReadyImage && !canAttachImages)) return;
    setChatDraftHandoff({
      content,
      attachmentIds: attachmentReadyIds,
      model,
      effort,
      webSearch,
      agentId,
    });
    clearAttachments();
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const col = composerColRef.current;
    if (reduced || !col) {
      router.push("/chat");
      return;
    }
    // Glide the composer column to where /chat's floating composer sits
    // (16px above the viewport bottom - its pb-4).
    const rect = col.getBoundingClientRect();
    setExitDelta(Math.max(0, window.innerHeight - 16 - rect.bottom));
    setLeaving(true);
    window.setTimeout(() => router.push("/chat"), EXIT_MS);
  };

  const activeTasks = tasks.filter(
    (t) => t.status === "in_progress" || t.status === "in_review",
  ).length;
  const unread = inbox.filter((i) => !i.read).length;
  const firstName = me?.displayName.split(" ")[0] ?? null;
  const subscriptionPicked = models.some(
    (m) =>
      m.source === "subscription" &&
      m.provider === model?.provider &&
      m.id === model?.model,
  );

  // §5.29.4 - only owners/admins see the onboarding banner; engineers don't
  // own the org-bootstrap path and shouldn't be redirected away.
  const activeOrgSlug =
    me?.memberships.find((m) => m.orgId === activeOrgId)?.orgSlug ?? null;
  const myRole =
    me?.memberships.find((m) => m.orgId === activeOrgId)?.role ?? null;
  const showOnboardingBanner =
    onboarding !== null &&
    onboarding.current !== "complete" &&
    activeOrgSlug !== null &&
    (myRole === "owner" || myRole === "admin");

  // BE /v1/cost/summary returns the slim CostSummaryOut shape today
  // (`total_cost_usd`, no budget fields). The richer `spend_usd` wire shape is
  // the §7.10 Phase-2 follow-up; fall back to null (hide it) until then.
  const spendLabel =
    cost && typeof cost.spend_usd === "number"
      ? `$${cost.spend_usd.toLocaleString()}`
      : null;

  // Everything except the composer column fades out during the exit motion.
  const fade = cn(
    "transition-opacity duration-200 ease-out",
    leaving && "pointer-events-none opacity-0",
  );

  return (
    <>
      {/* Full-bleed stage - negative margins cancel the AppShell main padding
          so the ambient background reaches the shell edges (no dead frame).
          These must track the shell's responsive padding
          (px-4 py-5 sm:px-6 sm:py-8 lg:px-8). */}
      <div className="relative isolate -mx-4 -my-5 flex min-h-[calc(100vh-3.5rem)] flex-col overflow-hidden sm:-mx-6 sm:-my-8 lg:-mx-8">
        <AmbientBackground variant="cosmos" />

        {(showOnboardingBanner || error) && (
          <div className={cn("shrink-0 px-6 pt-6 lg:px-8", fade)}>
            {showOnboardingBanner && activeOrgSlug && (
              <OnboardingBanner
                orgSlug={activeOrgSlug}
                onboarding={onboarding}
              />
            )}
            {error && (
              <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Centered stage - the one place to start. */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 lg:px-8">
          <Stack gap="5" className="w-full items-center text-center">
            <div className={fade}>
              <OwlAvatar
                size={88}
                mood={draft.trim() ? "focused" : "waiting"}
              />
            </div>
            <Stack gap="1" className={cn("items-center", fade)}>
              <GradientText
                as="h1"
                className="text-3xl font-semibold tracking-tight"
              >
                What should we build{firstName ? `, ${firstName}` : ""}?
              </GradientText>
              <p className="max-w-md text-sm text-[var(--text-muted)]">
                Ask about any domain or your whole org - answers cite your
                sources, and Athena can spin a task out of the conversation.
              </p>
            </Stack>

            {readOnly ? (
              <div className="glass-panel w-full max-w-2xl px-4 py-3 text-center text-xs text-[var(--text-muted)]">
                Demo mode - chat compose is disabled. Browse the precomputed
                conversations on the Chat page.
              </div>
            ) : (
              <>
                {/* The composer column mirrors /chat's exactly (max-w-3xl +
                    px-4 sm:px-6) so the glide lands on the same frame. */}
                <div
                  ref={composerColRef}
                  style={
                    leaving
                      ? { transform: `translateY(${exitDelta}px)` }
                      : undefined
                  }
                  className="w-full max-w-3xl px-4 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-6"
                >
                  {subscriptionPicked && (
                    <p
                      role="status"
                      className="text-micro mb-1.5 px-1 text-left text-[var(--text-subtle)]"
                    >
                      Using your subscription - answers come from the
                      conversation only; this model can&apos;t browse workspace
                      knowledge.
                    </p>
                  )}
                  <ChatComposer
                    hero
                    value={draft}
                    onChange={setDraft}
                    onSend={onAsk}
                    onStop={() => undefined}
                    sending={false}
                    disabled={leaving}
                    placeholder="Describe a task, ask a question…"
                    onPaste={onPasteAttach}
                    attachmentBar={
                      <AttachmentChips
                        drafts={attachmentDrafts}
                        onRemove={removeAttachment}
                      />
                    }
                    canSendWithoutText={attachmentReadyIds.length > 0}
                    sendBlocked={
                      attachPending || (hasReadyImage && !canAttachImages)
                    }
                    sendBlockedTitle={
                      attachPending
                        ? "Waiting for uploads to finish…"
                        : "This model can't read images - remove them or pick a vision model."
                    }
                    accessories={
                      <>
                        <ComposerActionsMenu
                          onFiles={addAttachments}
                          canAttachImages={canAttachImages}
                          webSearch={webSearch}
                          onToggleWebSearch={setWebSearch}
                          disabled={leaving || readOnly}
                        />
                        {agents.length > 0 && (
                          <AgentSelector
                            agents={agents}
                            value={agentId}
                            onChange={(id) => {
                              setAgentId(id);
                              const a = id ? agents.find((x) => x.id === id) : null;
                              // Only fill the agent's model when none is chosen yet.
                              if (model == null && a?.model_provider && a?.model_id) {
                                const sel: ModelSelection = a.model_source
                                  ? { provider: a.model_provider, model: a.model_id, source: a.model_source as "athena" | "byok" | "subscription" }
                                  : { provider: a.model_provider, model: a.model_id };
                                setModel(sel);
                                storeModel("chat", sel);
                              }
                            }}
                            disabled={leaving}
                            className={COMPOSER_PICKER_CLASS}
                          />
                        )}
                        <EffortSelector
                          value={effort}
                          onChange={setEffort}
                          disabled={leaving}
                          className={COMPOSER_PICKER_CLASS}
                        />
                        {models.length > 0 && (
                          <ModelSelector
                            models={models}
                            value={model}
                            onChange={(m) => {
                              setModel(m);
                              storeModel("chat", m);
                            }}
                            disabled={leaving}
                            className={COMPOSER_PICKER_CLASS}
                            includeSubscription
                            subscriptionGrounded={subscriptionGrounded}
                          />
                        )}
                      </>
                    }
                  />
                </div>
                <Cluster
                  gap="2"
                  justify="center"
                  className={cn("max-w-2xl", fade)}
                >
                  {EXAMPLE_PROMPTS.map((p) => (
                    <Button
                      key={p}
                      variant="glass"
                      size="sm"
                      onClick={() => setDraft(p)}
                      className="rounded-full font-normal"
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    variant="glass"
                    size="sm"
                    onClick={() => setOpenNew(true)}
                    className="rounded-full font-normal"
                  >
                    <Plus className="size-3.5" aria-hidden />
                    New task
                  </Button>
                </Cluster>
              </>
            )}

            {/* Readiness §5.28 row 1804 - surface a "Connect GitHub" CTA when
                the org has no active GitHub integration. Deep-links to
                /settings/integrations#github so the GitHub provider card
                scrolls into view (id="provider-github"). Suppressed during
                the integrations fetch + once a connection exists so it
                doesn't flash on first paint. */}
            {githubConnected === false && (
              <Cluster gap="2" align="center" justify="center" className={fade}>
                <span className="text-xs text-[var(--text-muted)]">
                  Bring your code into Athena to get grounded answers.
                </span>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  data-testid="dashboard-connect-github-cta"
                >
                  <Link href="/settings/integrations#github">
                    <Github className="size-4" />
                    Connect GitHub
                  </Link>
                </Button>
              </Cluster>
            )}
          </Stack>
        </div>

        {/* Continue dock - resume your work + what's on you. Replaces the old
            glanceable stat tiles: the same numbers live in the muted glance
            line, but the headline is "pick up where you left off". */}
        <div
          className={cn("flex shrink-0 justify-center px-6 pb-5 lg:px-8", fade)}
        >
          <div className="w-full max-w-3xl px-4 sm:px-6">
            {!loaded ? (
              <DockSkeleton />
            ) : !error ? (
              <ContinueDock
                tasks={tasks}
                meId={me?.id ?? null}
                unread={unread}
                activeCount={activeTasks}
                spendLabel={spendLabel}
                domainCount={domains.length}
              />
            ) : null}
          </div>
        </div>
      </div>

      <NewTaskDialog
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={onCreated}
      />
    </>
  );
}

/**
 * The home dock: resume your work + what's on you. Leads with up to three of
 * your most-recently-touched active tasks (an `in_review` one is promoted to
 * the accented "On you" slot), then a single muted glance line keeping the old
 * stat numbers one click from their full page. Stays a calm one-band dock - the
 * chat hero still owns the screen.
 */
function ContinueDock({
  tasks,
  meId,
  unread,
  activeCount,
  spendLabel,
  domainCount,
}: {
  tasks: Task[];
  meId: string | null;
  unread: number;
  activeCount: number;
  spendLabel: string | null;
  domainCount: number;
}) {
  const mine = meId
    ? tasks.filter(
        (t) => t.owner_user_id === meId || t.created_by_user_id === meId,
      )
    : [];
  const active = mine
    .filter(
      (t) =>
        t.status === "in_progress" ||
        t.status === "in_review" ||
        t.status === "blocked",
    )
    // `in_review` first (it's on you), then most-recently touched.
    .sort((a, b) => {
      if (a.status === "in_review" && b.status !== "in_review") return -1;
      if (b.status === "in_review" && a.status !== "in_review") return 1;
      return b.updated_at.localeCompare(a.updated_at);
    })
    .slice(0, 3);

  return (
    <div className="text-left">
      <hr className="hr-horizon mb-4" aria-hidden="true" />
      <Cluster justify="between" align="baseline" className="mb-2.5">
        <span className="text-sm text-[var(--text-muted)]">
          Pick up where you left off
        </span>
        <Link
          href="/my-work"
          className={cn(
            "inline-flex items-center gap-1 rounded-md text-sm text-[var(--primary)] hover:underline",
            focusRing,
          )}
        >
          Open My Work
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </Cluster>

      {active.length > 0 ? (
        <div className="grid gap-2.5 sm:grid-cols-3">
          {active.map((t) => (
            <ContinueCard key={t.id} task={t} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-[var(--border)] px-3 py-3 text-center text-xs text-[var(--text-muted)]">
          Nothing in progress yet. Start something above, or open Work to pick
          up a task.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatChip
          href="/inbox"
          icon={<Inbox className="size-3.5" aria-hidden />}
          value={unread}
          label="waiting on you"
          warn={unread > 0}
        />
        <StatChip
          href="/work"
          icon={<ListTodo className="size-3.5" aria-hidden />}
          value={activeCount}
          label="active"
        />
        {spendLabel && (
          <StatChip
            href="/cost"
            icon={<CircleDollarSign className="size-3.5" aria-hidden />}
            value={spendLabel}
            label="this month"
          />
        )}
        <StatChip
          href="/domains"
          icon={<Boxes className="size-3.5" aria-hidden />}
          value={domainCount}
          label="domains"
        />
      </div>
    </div>
  );
}

/** A quiet stat chip in the dock's glance row - icon + number + label with a
 *  full 32px hit area, one click from the stat's home page. */
function StatChip({
  href,
  icon,
  value,
  label,
  warn = false,
}: {
  href: string;
  icon: React.ReactNode;
  value: number | string;
  label: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-soft)] bg-[var(--surface)] px-3 text-xs transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]",
        focusRing,
        warn ? "text-[var(--warning-ink)]" : "text-[var(--text-muted)]",
      )}
    >
      {icon}
      <span
        className={cn(
          "font-medium tabular-nums",
          warn ? "text-[var(--warning-ink)]" : "text-[var(--text)]",
        )}
      >
        {value}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function ContinueCard({ task }: { task: Task }) {
  const onYou = task.status === "in_review";
  const blocked = task.status === "blocked";
  return (
    <Link
      href={`/work/${task.id}`}
      className={cn(
        "block rounded-lg border px-3 py-2.5 transition-colors",
        focusRing,
        onYou
          ? "border-[var(--primary)] bg-[var(--primary-soft)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {onYou ? (
          <Eyebrow className="text-[var(--primary)]">On you</Eyebrow>
        ) : (
          <span
            className="star-dot"
            style={
              {
                "--dot-color": blocked
                  ? "var(--warning)"
                  : "var(--success)",
              } as CSSProperties
            }
            aria-hidden
          />
        )}
        <span className="text-micro font-mono text-[var(--text-muted)]">
          {task.display_id}
        </span>
      </div>
      <p className="line-clamp-1 text-sm text-[var(--text)]">{task.title}</p>
      <p
        className={cn(
          "text-micro mt-0.5",
          onYou
            ? "text-[var(--primary)]"
            : blocked
              ? "text-[var(--warning-ink)]"
              : "text-[var(--text-muted)]",
        )}
      >
        {onYou ? "Review and approve" : blocked ? "Blocked" : "In progress"}
      </p>
    </Link>
  );
}

function DockSkeleton() {
  return (
    <div aria-hidden>
      <hr className="hr-horizon mb-4" />
      <Skeleton className="mb-2.5 h-4 w-40" />
      <div className="grid gap-2.5 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * §5.29.4 - banner shown on the dashboard when the active org's onboarding
 * isn't complete (owner/admin only - engineers don't own the bootstrap path).
 * Visualises how many of the 4 canonical steps are done + deep-links to
 * the wizard at the right step.
 */
function OnboardingBanner({
  orgSlug,
  onboarding,
}: {
  orgSlug: string;
  onboarding: OnboardingState;
}) {
  const done = onboarding.steps.filter((s) => s.status === "done").length;
  const total = onboarding.steps.length;
  return (
    <Card className="border-[var(--primary)] bg-[var(--primary-soft)]">
      <Cluster gap="3" align="center" justify="between">
        <Cluster gap="3" align="center">
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)] shadow-[var(--shadow-1)]">
            <Rocket className="size-4" />
          </span>
          <Stack gap="1">
            <span className="text-sm font-semibold">
              Finish setting up your workspace
            </span>
            <Cluster gap="2" align="center">
              <span
                role="img"
                aria-label={`${done} of ${total} steps done`}
                className="flex items-center"
              >
                {onboarding.steps.map((s, i) => (
                  <span key={s.id} className="flex items-center">
                    {i > 0 && (
                      <span
                        className="constellation-link w-4"
                        aria-hidden
                      />
                    )}
                    <span
                      className="star-dot"
                      style={
                        {
                          "--dot-color":
                            s.status === "done"
                              ? "var(--primary)"
                              : "var(--border-strong)",
                        } as CSSProperties
                      }
                      aria-hidden
                    />
                  </span>
                ))}
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                about {Math.max(1, total - done) * 2} minutes left
              </span>
            </Cluster>
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
