"use client";

/**
 * ArtifactCard - renders the selected stage's working artifact.
 *
 * Body: the latest (working) artifact body as REAL markdown
 * (`ArtifactMarkdown` → the shared chat renderer: headings, lists, tables,
 * code, ```mermaid diagrams) with `kn://` / `repo://` refs as citation chips;
 * runnable HTML rides in the sandboxed `HtmlPreview` (allow-scripts only,
 * never `dangerouslySetInnerHTML`). The AI only ever uses this working
 * version - old revisions are never fed into agent context.
 *
 * "Generated from" expander → `api.tasks.provenance(id, artifactId)` (`Ref[]`):
 * the source pointers of the steps that produced this artifact (lazy; fetched
 * on first open).
 *
 * Version history → `api.tasks.artifactVersions(id, artifactId)`: the audit
 * list, plus View (a past version's body on demand) and "Make working
 * version" - an append-only rollback (`restoreArtifactVersion`; restoring
 * over an approved stage re-derives downstream, same as a manual edit).
 *
 * The card is otherwise read-only - editing/authoring lives in
 * `StageComposer` (the manual path). A stage with no artifact yet renders an
 * empty hint instead.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  GitPullRequest,
  History,
  MonitorPlay,
  MousePointerClick,
  PenLine,
  Save,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";

import { toast } from "sonner";

import {
  ApiError,
  api,
  type ArtifactDetail,
  type ArtifactVersion,
  type ArtifactVersionDetail,
  type EffortLevel,
  type ModelSelection,
  type Ref,
  type SandboxResult,
  type StageRefineInput,
} from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cluster, Stack } from "@/components/layout/primitives";
import { EffortSelector } from "@/components/ui/effort-selector";
import { MermaidDiagram } from "@/components/ui/mermaid-diagram";
import { ModelSelector } from "@/components/ui/model-selector";
import { useEnabledModels } from "@/hooks/use-enabled-models";
import { restoreModelSelection, storeModel, usePersistedEffort } from "@/lib/prefs/run-prefs";
import { ArtifactMarkdown } from "@/components/work/artifact-markdown";
import { SubtaskPlanView } from "@/components/work/subtask-plan-view";
import { DiffView, looksLikePatch } from "@/components/work/diff-view";
import { SandboxEvidenceStrip } from "@/components/work/sandbox-evidence-strip";
import { SUBTASK_PLAN_EDIT_ERROR, subtaskPlanItemCount } from "@/lib/work/subtask-plan";
import { formatDateTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

export function ArtifactCard({
  taskId,
  artifactId,
  artifactKind,
  stageTitle,
  /** Bumped by the page when an `artifact_ready` SSE signal lands so the card
   *  re-fetches the freshly-minted working version. */
  refreshKey,
  /** "Edit by asking AI" (DSGN-1): refine the design prototype by describing a
   *  change (optionally scoped to a clicked element), at the picked effort /
   *  model. Provided for design artifacts only; absent → the prototype is
   *  read-only (preview + code). */
  onRefine,
  /** The stage this artifact belongs to - required for the inline manual Edit
   *  (the author endpoint is keyed by stage, not artifact id). Absent → the
   *  card is read-only (no Edit button). */
  stageKey,
  /** Whether the owning stage is APPROVED - an edit then re-derives downstream
   *  (the editor shows the cascade warning before saving). */
  approved = false,
  /** Downstream stages re-derived when an approved artifact is edited - drives
   *  the cascade-warning copy. */
  downstreamCount = 0,
  /** Called after a successful inline edit so the page re-fetches the stage
   *  (an approved edit reopens the stage + downstream). */
  onEdited,
}: {
  taskId: string;
  artifactId: string;
  artifactKind: string | null;
  stageTitle: string;
  refreshKey?: number | undefined;
  onRefine?: (req: StageRefineInput) => Promise<void>;
  stageKey?: string;
  approved?: boolean;
  downstreamCount?: number;
  onEdited?: () => void | Promise<void>;
}) {
  const [detail, setDetail] = useState<ArtifactDetail | null>(null);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // Inline manual edit of THIS artifact's body (the deliverable). Editing is
  // available for the primary artifact whenever a stageKey is provided; saving
  // mints a new working version (an approved stage then re-derives downstream).
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const canEdit = Boolean(stageKey);

  const load = useCallback(
    async (cancelledRef?: { cancelled: boolean }) => {
      try {
        const [body, vers] = await Promise.all([
          api.tasks.artifact(taskId, artifactId),
          api.tasks.artifactVersions(taskId, artifactId).catch(() => [] as ArtifactVersion[]),
        ]);
        if (!cancelledRef?.cancelled) {
          setDetail(body);
          setVersions(vers);
        }
      } catch (e) {
        if (cancelledRef?.cancelled) return;
        setError(e instanceof ApiError ? e.message : "Failed to load artifact");
      } finally {
        if (!cancelledRef?.cancelled) setIsLoading(false);
      }
    },
    [taskId, artifactId],
  );

  useEffect(() => {
    const ref = { cancelled: false };
    setIsLoading(true);
    setError(null);
    void load(ref);
    return () => {
      ref.cancelled = true;
    };
    // refreshKey re-fetches the freshly-minted working version on SSE signal.
  }, [load, refreshKey]);

  const startEdit = () => {
    setEditBody(detail?.body ?? "");
    setEditError(null);
    setEditing(true);
  };

  // Persist an edited body via the author endpoint (a new working version; an
  // approved stage then re-derives downstream). The plain-textarea path passes
  // the local draft; the structured subtask_plan editor passes its serialized
  // body straight in.
  const persistEdit = async (rawBody: string) => {
    if (!stageKey) return;
    const body = rawBody.trim();
    if (!body) {
      setEditError("The artifact can't be empty.");
      return;
    }
    // The decompose plan is structured JSON the approve gate materializes - a
    // malformed body would degrade the render to raw text. Validate before save.
    if (artifactKind === "subtask_plan" && subtaskPlanItemCount(body) === null) {
      setEditError(SUBTASK_PLAN_EDIT_ERROR);
      return;
    }
    setSavingEdit(true);
    try {
      await api.tasks.authorArtifact(taskId, stageKey, {
        body,
        ...(artifactKind ? { kind: artifactKind } : {}),
      });
      // Editing an APPROVED artifact reopened the stage to `ready` (and
      // re-derived downstream) server-side - re-submit so it goes back through
      // the gate for re-approval (the prior "edit this stage" flow). An
      // in_review edit just updates the working doc the open gate approves; a
      // ready/failed edit stays put for the user to run or submit next.
      if (approved) await api.tasks.submitStage(taskId, stageKey);
      toast.success(
        approved
          ? "Saved - it goes back through the gate, and downstream re-derives."
          : "Saved a new version of the deliverable.",
      );
      setEditing(false);
      await load();
      await onEdited?.();
    } catch (e) {
      setEditError(e instanceof ApiError ? e.message : "Couldn't save your edit.");
    } finally {
      setSavingEdit(false);
    }
  };

  // The plain-textarea save reads the local draft (markdown artifacts).
  const saveEdit = () => persistEdit(editBody);

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  if (isLoading) {
    return (
      <Card variant="elevated">
        <Stack gap="3">
          <div className="h-5 w-48 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-[var(--surface-2)]" />
          <div className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface-2)]" />
        </Stack>
      </Card>
    );
  }

  if (error || !detail) {
    return (
      <Card variant="elevated" className="border-[var(--border-strong)] bg-[var(--danger-soft)]">
        <p className="text-sm text-[var(--danger-ink)]">{error ?? "This artifact is unavailable."}</p>
      </Card>
    );
  }

  return (
    <Card variant="elevated">
      <Stack gap="3">
        <Cluster justify="between" align="center" className="border-b border-[var(--border)] pb-2.5">
          <Cluster gap="2" align="center">
            <FileText className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">{stageTitle}</span>
            {artifactKind && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                {artifactKind.replace(/_/g, " ")}
              </span>
            )}
          </Cluster>
          <Cluster gap="2" align="center">
            <span className="text-xs text-[var(--text-muted)]">working version · v{detail.version}</span>
            {canEdit && !editing && (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <PenLine className="size-3.5" />
                Edit
              </Button>
            )}
          </Cluster>
        </Cluster>

        {editing ? (
          <Stack gap="2.5">
            {approved && downstreamCount > 0 && (
              <Cluster gap="2" align="start" className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-ink)]" aria-hidden />
                <span className="text-xs text-[var(--warning-ink)]">
                  Saving re-derives {downstreamCount} downstream stage
                  {downstreamCount === 1 ? "" : "s"} into new versions. Old versions stay in
                  history; Athena only ever uses the latest.
                </span>
              </Cluster>
            )}
            {artifactKind === "subtask_plan" && subtaskPlanItemCount(editBody) !== null ? (
              // A valid decompose plan edits as a structured form (IMPL-18): the
              // editor owns its Save/Cancel and hands back the serialized body.
              // A malformed plan body falls through to the raw textarea so it can
              // still be repaired (graceful fallback).
              <SubtaskPlanView
                body={editBody}
                editable
                saving={savingEdit}
                error={editError}
                onSave={(nextBody) => void persistEdit(nextBody)}
                onCancel={cancelEdit}
              />
            ) : (
              <>
                <textarea
                  value={editBody}
                  onChange={(e) => {
                    setEditBody(e.target.value);
                    if (editError) setEditError(null);
                  }}
                  aria-label={`Edit ${stageTitle}`}
                  className={cn(
                    "min-h-[260px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2",
                    "font-mono text-sm leading-relaxed text-[var(--text)] placeholder:text-[var(--text-subtle)]",
                    "focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]",
                  )}
                />
                {editError && (
                  <p
                    role="alert"
                    className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
                  >
                    {editError}
                  </p>
                )}
                <Cluster gap="2">
                  <Button size="sm" loading={savingEdit} disabled={savingEdit} onClick={() => void saveEdit()}>
                    <Save className="size-3.5" />
                    Save changes
                  </Button>
                  <Button size="sm" variant="ghost" disabled={savingEdit} onClick={cancelEdit}>
                    Cancel
                  </Button>
                </Cluster>
              </>
            )}
          </Stack>
        ) : (
          <ArtifactBody
            body={detail.body}
            artifactKind={artifactKind}
            sandboxResult={detail.sandbox_result ?? null}
            {...(onRefine ? { onRefine } : {})}
          />
        )}

        <ProvenanceExpander taskId={taskId} artifactId={artifactId} refreshKey={refreshKey} />

        <VersionHistory
          taskId={taskId}
          artifactId={artifactId}
          versions={versions}
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
          onRestored={() => void load()}
        />
      </Stack>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Kind-aware body rendering                                                    //
// --------------------------------------------------------------------------- //

type Segment =
  | { type: "prose"; text: string }
  | { type: "code"; lang: string; code: string };

/** Split a markdown body into prose runs and fenced code blocks. A design
 *  artifact's runnable HTML rides in a ```html block; diffs/code ride in their
 *  own fences. An unterminated fence falls through as prose (never throws). */
function parseSegments(body: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([\w-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(body)) !== null) {
    const prose = body.slice(last, m.index);
    if (prose.trim()) segments.push({ type: "prose", text: prose });
    segments.push({ type: "code", lang: (m[1] ?? "").toLowerCase(), code: m[2] ?? "" });
    last = fence.lastIndex;
  }
  const tail = body.slice(last);
  if (tail.trim()) segments.push({ type: "prose", text: tail });
  return segments.length > 0 ? segments : [{ type: "prose", text: body }];
}

const HTML_HINT = /<(!doctype|html|head|body|div|section|main|style|script)/i;

/** Render an artifact body by kind/shape: prose as light markdown, code in a
 *  code block, and an HTML/CSS/JS prototype in a sandboxed live preview. */
function ArtifactBody({
  body,
  artifactKind,
  sandboxResult,
  onRefine,
}: {
  body: string;
  artifactKind: string | null;
  sandboxResult?: SandboxResult | null;
  onRefine?: (req: StageRefineInput) => Promise<void>;
}) {
  // The decompose plan is structured (JSON), not prose - render it as a legible
  // breakdown with dependency labels (SUB-3), not raw markdown.
  if (artifactKind === "subtask_plan") {
    return <SubtaskPlanView body={body} />;
  }
  // The implementation flow's change artifacts render as a real diff (DEV-1) so
  // the developer reviews the change line-by-line before the PR gate.
  if (artifactKind === "diff_set" || artifactKind === "pr_build_fix") {
    return <DiffArtifactBody body={body} sandboxResult={sandboxResult ?? null} />;
  }
  // The PR artifact leads with a clear "open the pull request" affordance (DEV-5).
  if (artifactKind === "pull_request") {
    return <PullRequestBody body={body} />;
  }
  const isDesign = (artifactKind ?? "").startsWith("design");
  const segments = parseSegments(body);
  return (
    <Stack gap="3" className="min-w-0">
      {segments.map((seg, i) =>
        seg.type === "prose" ? (
          <ArtifactMarkdown key={i} text={seg.text} />
        ) : isHtmlSegment(seg, isDesign) ? (
          <HtmlPreview key={i} code={seg.code} {...(isDesign && onRefine ? { onRefine } : {})} />
        ) : seg.lang === "mermaid" ? (
          <MermaidDiagram key={i} chart={seg.code.replace(/\n+$/, "")} />
        ) : (
          <CodeBlock key={i} lang={seg.lang} code={seg.code} />
        ),
      )}
    </Stack>
  );
}

function isHtmlSegment(seg: { lang: string; code: string }, isDesign: boolean): boolean {
  if (seg.lang === "html" || seg.lang === "htm") return true;
  // A design artifact's untagged block that clearly contains markup still previews.
  return isDesign && seg.lang === "" && HTML_HINT.test(seg.code);
}

/** The implementation-flow change artifacts (diff_set / pr_build_fix): prose
 *  runs render as markdown, and ```diff fences - or a whole-body raw patch -
 *  render through the real file-by-file <DiffView> (DEV-1). */
function DiffArtifactBody({
  body,
  sandboxResult,
}: {
  body: string;
  sandboxResult?: SandboxResult | null;
}) {
  const segments = parseSegments(body);
  const hasFencedDiff = segments.some((s) => s.type === "code" && s.lang === "diff");
  // The advisory build+test strip mounts ABOVE the diff (ADR-086); absent
  // sandbox_result renders exactly today's gate.
  const strip = sandboxResult ? <SandboxEvidenceStrip result={sandboxResult} /> : null;
  if (!hasFencedDiff && looksLikePatch(body)) {
    return (
      <Stack gap="3" className="min-w-0">
        {strip}
        <DiffView patch={body} />
      </Stack>
    );
  }
  return (
    <Stack gap="3" className="min-w-0">
      {strip}
      {segments.map((seg, i) =>
        seg.type === "prose" ? (
          <ArtifactMarkdown key={i} text={seg.text} />
        ) : seg.lang === "diff" ? (
          <DiffView key={i} patch={seg.code} />
        ) : (
          <CodeBlock key={i} lang={seg.lang} code={seg.code} />
        ),
      )}
    </Stack>
  );
}

const URL_RE = /(https?:\/\/[^\s)]+)/;

/** The pull_request artifact: surface the PR link as a primary action when the
 *  body carries one, then the PR description as prose (DEV-5). */
function PullRequestBody({ body }: { body: string }) {
  const url = URL_RE.exec(body)?.[1] ?? null;
  return (
    <Stack gap="3">
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <GitPullRequest className="size-4 text-[var(--primary)]" aria-hidden />
          Open pull request
          <ExternalLink className="size-3 text-[var(--text-subtle)]" aria-hidden />
        </a>
      )}
      <ArtifactMarkdown text={body} />
    </Stack>
  );
}

interface PickedEl {
  selector: string;
  tag: string;
  text: string;
  snippet: string;
}

function isDesignPick(d: unknown): d is { source: string } & PickedEl {
  return (
    typeof d === "object" &&
    d !== null &&
    (d as { source?: unknown }).source === "athena-design-pick"
  );
}

// Injected into the prototype iframe in EDIT mode (DSGN-1): outlines the hovered
// element and, on click, posts the clicked element's selector + snippet up to
// the cockpit so a refine instruction can be scoped to just that component. Runs
// inside the `allow-scripts` sandbox; the indigo outline is iframe-internal
// editor chrome (not app CSS), so a literal colour here is intentional.
const EDITOR_SCRIPT = `(function(){
  if (window.__athenaEdit) return; window.__athenaEdit = true;
  var last = null;
  function path(el){
    var parts = [];
    while (el && el.nodeType === 1 && el.tagName !== 'BODY' && parts.length < 5){
      var sel = el.tagName.toLowerCase();
      if (el.id){ parts.unshift(sel + '#' + el.id); break; }
      var cls = (typeof el.className === 'string') ? el.className.trim().split(' ').filter(Boolean).slice(0,2).join('.') : '';
      if (cls) sel += '.' + cls;
      var p = el.parentNode;
      if (p && p.children){
        var same = Array.prototype.filter.call(p.children, function(c){ return c.tagName === el.tagName; });
        if (same.length > 1) sel += ':nth-of-type(' + (Array.prototype.indexOf.call(same, el) + 1) + ')';
      }
      parts.unshift(sel);
      el = el.parentNode;
    }
    return parts.join(' > ');
  }
  document.addEventListener('mouseover', function(e){
    if (last && last.style) last.style.outline = '';
    last = e.target;
    if (last && last.style){ last.style.outline = '2px solid #6366f1'; last.style.outlineOffset = '-2px'; }
  }, true);
  document.addEventListener('click', function(e){
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    var html = (el && el.outerHTML) ? el.outerHTML : '';
    parent.postMessage({
      source: 'athena-design-pick',
      selector: path(el),
      tag: (el && el.tagName ? el.tagName : '').toLowerCase(),
      text: (el && el.textContent ? el.textContent : '').trim().slice(0, 80),
      snippet: html.slice(0, 600)
    }, '*');
  }, true);
})();`;

/** Sandboxed live preview of a runnable HTML/CSS/JS prototype, with Code and -
 *  when `onRefine` is provided (design artifacts) - an Edit tab: the
 *  "edit components by asking AI" playground (DSGN-1). In Edit, clicking an
 *  element in the preview scopes the AI instruction to it; Apply re-runs the
 *  design stage with that instruction and saves a new version. The iframe is
 *  `allow-scripts` ONLY (no same-origin / forms / popups) so AI-authored markup
 *  can run but never reach the parent, cookies, or storage. */
export function HtmlPreview({
  code,
  onRefine,
}: {
  code: string;
  onRefine?: (req: StageRefineInput) => Promise<void>;
}) {
  const views = onRefine ? (["preview", "code", "edit"] as const) : (["preview", "code"] as const);
  const [view, setView] = useState<"preview" | "code" | "edit">("preview");
  const [picked, setPicked] = useState<PickedEl | null>(null);
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const base = useId();
  const panelId = `${base}-panel`;
  const tabId = (v: string) => `${base}-${v}-tab`;

  // A new working version arrived (a refine landed / a re-run) - return to a
  // clean preview so a stale selection or instruction never lingers.
  useEffect(() => {
    setView("preview");
    setPicked(null);
    setInstruction("");
  }, [code]);

  // Edit mode: the injected picker postMessages the clicked element up. Accept
  // only messages from OUR sandboxed iframe (its origin is the opaque "null").
  useEffect(() => {
    if (view !== "edit") return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (isDesignPick(e.data)) {
        const d = e.data;
        setPicked({ selector: d.selector, tag: d.tag, text: d.text, snippet: d.snippet });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [view]);

  // Roving tablist: Left/Right (and Home/End) move across the tabs (ARIA pattern).
  const onTabKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const idx = (views as readonly string[]).indexOf(view);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? views.length - 1
          : e.key === "ArrowRight"
            ? Math.min(idx + 1, views.length - 1)
            : Math.max(idx - 1, 0);
    setView(views[next] ?? "preview");
  };

  const apply = async (run: { effort: EffortLevel; model: ModelSelection | null }) => {
    if (!onRefine || !instruction.trim()) return;
    const text = instruction.trim();
    const scoped = picked
      ? `Refine the design - change ONLY this element and leave the rest of the page intact.\n` +
        `Element: ${picked.selector} (<${picked.tag}>${picked.text ? ` "${picked.text}"` : ""}).\n` +
        `Requested change: ${text}`
      : `Refine the design: ${text}`;
    setSubmitting(true);
    try {
      await onRefine({
        instruction: scoped,
        effort: run.effort,
        ...(run.model
          ? { model_provider: run.model.provider, model_id: run.model.model }
          : {}),
        ...(run.model?.source && run.model.source !== "subscription"
          ? { model_source: run.model.source }
          : {}),
      });
      setInstruction("");
      setPicked(null);
      setView("preview");
    } catch {
      // The caller surfaces the error toast; keep the editor open to retry.
    } finally {
      setSubmitting(false);
    }
  };

  const isEdit = view === "edit";
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <Cluster
        justify="between"
        align="center"
        className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <MonitorPlay className="size-3.5 text-[var(--primary)]" aria-hidden />
          Prototype
        </span>
        <div className="flex items-center gap-1" role="tablist" aria-label="Prototype view">
          {views.map((v) => (
            <ViewToggle
              key={v}
              id={tabId(v)}
              controls={panelId}
              active={view === v}
              onClick={() => setView(v)}
              onKeyDown={onTabKey}
            >
              {v === "preview" ? (
                "Preview"
              ) : v === "code" ? (
                <>
                  <Code2 className="size-3" aria-hidden />
                  Code
                </>
              ) : (
                <>
                  <Wand2 className="size-3" aria-hidden />
                  Edit
                </>
              )}
            </ViewToggle>
          ))}
        </div>
      </Cluster>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(view)}>
        {view === "code" ? (
          <pre className="max-h-[460px] overflow-auto bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
            <code className="font-mono">{code}</code>
          </pre>
        ) : (
          <>
            <iframe
              ref={iframeRef}
              title={isEdit ? "Design prototype - click an element to edit" : "Design prototype preview"}
              srcDoc={isEdit ? code + "\n<script>" + EDITOR_SCRIPT + "</script>" : code}
              sandbox="allow-scripts"
              loading="lazy"
              className="h-[460px] w-full border-0 bg-[var(--surface)]"
            />
            {isEdit && (
              <RefinePanel
                picked={picked}
                instruction={instruction}
                submitting={submitting}
                onInstruction={setInstruction}
                onClear={() => setPicked(null)}
                onApply={(run) => void apply(run)}
                onCancel={() => {
                  setView("preview");
                  setPicked(null);
                  setInstruction("");
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The "edit by asking AI" bar under the prototype in Edit mode: the picked
 *  element (or whole-design fallback), the instruction field, the effort dial +
 *  model pick (same controls as a stage run), and Apply/Cancel. */
function RefinePanel({
  picked,
  instruction,
  submitting,
  onInstruction,
  onClear,
  onApply,
  onCancel,
}: {
  picked: PickedEl | null;
  instruction: string;
  submitting: boolean;
  onInstruction: (v: string) => void;
  onClear: () => void;
  onApply: (run: { effort: EffortLevel; model: ModelSelection | null }) => void;
  onCancel: () => void;
}) {
  // How hard Athena works this refine (tool budget + subagent policy). Flow
  // content, not plumbing - always shown next to Apply; defaults to a balanced
  // middle and is remembered across refreshes (mirrors StageComposer - same
  // run-prefs "task" scope, it's the same kind of action on the same page).
  const [effort, setEffort] = usePersistedEffort("task");

  // Per-action model pick (the locked "model per AI action" design). Defaults to
  // the org's first enabled model; null falls back to the action default server-
  // side, so a refine never depends on a selection. Model choice is plumbing -
  // only worth a control when there is an actual choice to make (>1 enabled
  // model). With 0–1 it's hidden and the run uses the org/action default (INT-4).
  const { models } = useEnabledModels();
  const enabledModels = models.filter((m) => m.enabled);
  const [model, setModel] = useState<ModelSelection | null>(null);
  useEffect(() => {
    if (model !== null) return;
    const restored = restoreModelSelection("task", models);
    if (restored) {
      setModel(restored);
      return;
    }
    const first = models.find((m) => m.enabled);
    if (first) setModel({ provider: first.provider, model: first.id, source: first.source });
  }, [models, model]);

  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-3">
      <Stack gap="2">
        <Cluster gap="2" align="center" className="flex-wrap">
          <MousePointerClick className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden />
          {picked ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text)]">
              <span className="font-mono text-[var(--primary)]">{`<${picked.tag}>`}</span>
              {picked.text && (
                <span className="max-w-[200px] truncate text-[var(--text-muted)]">{picked.text}</span>
              )}
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear element selection"
                className="ml-0.5 rounded p-0.5 text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              Click any element in the preview to edit just that part - or describe a change to the
              whole design.
            </span>
          )}
        </Cluster>
        <textarea
          value={instruction}
          onChange={(e) => onInstruction(e.target.value)}
          placeholder={picked ? "Describe the change to this element…" : "Describe the change to the design…"}
          className="min-h-[64px] w-full resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
        />
        <Cluster gap="2" align="center">
          <Button
            size="sm"
            loading={submitting}
            disabled={submitting || !instruction.trim()}
            onClick={() => onApply({ effort, model })}
          >
            <Wand2 className="size-3.5" />
            Apply with AI
          </Button>
          <EffortSelector value={effort} onChange={setEffort} disabled={submitting} />
          {enabledModels.length > 1 && (
            <ModelSelector
              models={models}
              value={model}
              onChange={(m) => {
                setModel(m);
                storeModel("task", m);
              }}
              disabled={submitting}
            />
          )}
          <Button size="sm" variant="ghost" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        </Cluster>
        <p className="text-[11px] text-[var(--text-muted)]">
          Athena edits the prototype and saves a new version - the current version stays in history.
        </p>
      </Stack>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  onKeyDown,
  id,
  controls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  id: string;
  controls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controls}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        active
          ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-1)]"
          : "text-[var(--text-muted)] hover:text-[var(--text)]",
      )}
    >
      {children}
    </button>
  );
}

/** A fenced code block (diff / json / ts / …) rendered as readable monospace
 *  rather than flattened into prose. */
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      {lang && (
        <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
          {lang}
        </div>
      )}
      <pre className="max-h-[460px] overflow-auto bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--text)]">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/** "Generated from" - lazily fetches the artifact's provenance Refs on first
 *  open. Refs only (kind + label); bodies open in their natural home. */
function ProvenanceExpander({
  taskId,
  artifactId,
  refreshKey,
}: {
  taskId: string;
  artifactId: string;
  refreshKey?: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<Ref[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.tasks.provenance(taskId, artifactId);
      setRefs(result);
    } catch {
      setRefs([]);
    } finally {
      setLoading(false);
    }
  }, [taskId, artifactId]);

  // Drop the cached refs when the artifact is re-minted so the next open
  // re-fetches the fresh provenance.
  useEffect(() => {
    setRefs(null);
    setOpen(false);
  }, [refreshKey]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && refs === null && !loading) void fetchRefs();
  };

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
        <Sparkles className="size-3.5 text-[var(--primary)]" aria-hidden />
        Generated from
        {refs !== null && <span className="text-[var(--text-subtle)]">· {refs.length}</span>}
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          {loading ? (
            <div className="flex flex-col gap-1.5" aria-hidden>
              {[0, 1].map((i) => (
                <div key={i} className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-3)]" />
              ))}
            </div>
          ) : refs && refs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {refs.map((r, i) => (
                <span
                  key={`${i}-${r.id}`}
                  className="inline-flex max-w-[260px] items-center gap-1 rounded-full bg-[var(--surface-3)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]"
                  title={`${r.kind}: ${r.label || r.id}`}
                >
                  <span className="uppercase tracking-wider opacity-70">{r.kind}</span>
                  <span className="truncate text-[var(--text)]">{r.label || r.id}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              No recorded sources - this was authored directly.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Version history - the human audit trail, plus View (a past version's body
 *  on demand) and "Make working version" (append-only rollback: the old body
 *  becomes a NEW version; restoring over an approved stage re-derives
 *  downstream, exactly like a manual edit). The AI only ever uses the working
 *  version. */
function VersionHistory({
  taskId,
  artifactId,
  versions,
  open,
  onToggle,
  onRestored,
}: {
  taskId: string;
  artifactId: string;
  versions: ArtifactVersion[];
  open: boolean;
  onToggle: () => void;
  onRestored: () => void;
}) {
  const [viewing, setViewing] = useState<ArtifactVersionDetail | null>(null);
  const [busy, setBusy] = useState<null | "view" | "restore">(null);

  const view = async (version: number) => {
    setBusy("view");
    try {
      setViewing(await api.tasks.artifactVersion(taskId, artifactId, version));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't load that version.");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (version: number) => {
    setBusy("restore");
    try {
      await api.tasks.restoreArtifactVersion(taskId, artifactId, version);
      toast.success(
        `v${version} is the working version again - saved as a new version, history intact.`,
      );
      setViewing(null);
      onRestored();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't restore that version.");
    } finally {
      setBusy(null);
    }
  };

  if (versions.length === 0) return null;
  return (
    <div className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        {open ? (
          <ChevronDown className="size-3.5" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5" aria-hidden />
        )}
        <History className="size-3.5" aria-hidden />
        Version history
        <span className="text-[var(--text-subtle)]">· {versions.length}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-2.5">
          <Stack gap="1.5" as="ul">
            {[...versions]
              .sort((a, b) => b.version - a.version)
              .map((v, i) => (
                <li
                  key={v.version}
                  className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]"
                >
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium",
                      i === 0
                        ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
                        : "bg-[var(--surface-3)] text-[var(--text-subtle)]",
                    )}
                  >
                    {i === 0 && <CheckCircle2 className="size-3" aria-hidden />}v{v.version}
                  </span>
                  <span className="text-[var(--text)]">
                    {v.who_kind === "agent" ? "Athena" : v.who_kind}
                  </span>
                  <span>·</span>
                  <span>{formatDateTime(v.created_at)}</span>
                  {i === 0 ? (
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--success-ink)]">
                      working - what Athena uses
                    </span>
                  ) : (
                    <span className="ml-auto inline-flex gap-1">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void view(v.version)}
                        className="rounded px-1.5 py-0.5 font-medium text-[var(--primary)] hover:bg-[var(--surface-3)] disabled:opacity-50"
                      >
                        View
                      </button>
                    </span>
                  )}
                </li>
              ))}
          </Stack>
          {viewing && (
            <div
              data-testid="version-preview"
              className="mt-2.5 min-w-0 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3"
            >
              <Stack gap="2">
                <Cluster gap="2" align="center" justify="between" className="flex-wrap">
                  <span className="text-xs font-semibold text-[var(--text)]">
                    Viewing v{viewing.version}{" "}
                    <span className="font-normal text-[var(--text-muted)]">
                      ({viewing.who_kind === "agent" ? "Athena" : viewing.who_kind} ·{" "}
                      {formatDateTime(viewing.created_at)}) - not the working version
                    </span>
                  </span>
                  <Cluster gap="1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === "restore"}
                      disabled={busy !== null}
                      onClick={() => void restore(viewing.version)}
                    >
                      <History className="size-3.5" />
                      Make this the working version
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => setViewing(null)}
                    >
                      Close
                    </Button>
                  </Cluster>
                </Cluster>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Restoring saves this body as a new version - nothing is deleted. If the
                  stage was approved, downstream stages re-derive from it.
                </p>
                <div className="max-h-[320px] min-w-0 overflow-auto">
                  <ArtifactMarkdown text={viewing.body} />
                </div>
              </Stack>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
