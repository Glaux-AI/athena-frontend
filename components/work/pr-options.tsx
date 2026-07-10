"use client";

/**
 * PR options + the "Review & fix PR" action.
 *
 * `PrOptionsDisclosure` is the collapsible form for the human's PR overrides -
 * branch name, title, description. It is shown at the execution gate (the
 * pre-open moment: the diff being approved is what becomes the PR) and on the
 * raise_pr artifact card. Once the PR is open the branch is LOCKED (it is the CI
 * correlation key) - the field goes read-only with a note, while title and
 * description still update the live PR.
 *
 * `ReviewFixPrButton` triggers a user-driven PR-fix round: pr_heal reads the
 * PR's live CI/Jenkins status + open review comments and pushes a fix to the PR
 * branch (a human still merges - ADR-027 #19). A manual press resets the heal
 * budget, so it can be pressed again for another round.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Save, Wrench } from "lucide-react";
import { toast } from "sonner";

import { ApiError, api, type PrOptions } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { focusRing } from "@/components/ui/focus";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

const FIELD_CLASS =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60";
const LABEL_CLASS = "text-xs font-medium text-[var(--text-muted)]";

export function ReviewFixPrButton({
  taskId,
  onStarted,
}: {
  taskId: string;
  onStarted?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await api.tasks.fixPr(taskId, {});
      toast.success(
        "Athena is reviewing the PR - it fixes CI/Jenkins failures and review comments, then a human merges.",
      );
      await onStarted?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't start the PR fix.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="outline"
      loading={busy}
      disabled={busy}
      onClick={() => void run()}
    >
      {!busy && <Wrench className="size-3.5" />}
      Review &amp; fix PR
    </Button>
  );
}

export function PrOptionsDisclosure({
  taskId,
  onSaved,
}: {
  taskId: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-[var(--text)]",
          focusRing,
        )}
      >
        {open ? (
          <ChevronDown className="size-4 text-[var(--text-subtle)]" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-[var(--text-subtle)]" aria-hidden />
        )}
        <GitBranch className="size-4 text-[var(--primary)]" aria-hidden />
        Pull request options
      </button>
      {open && (
        <div className="border-t border-[var(--border)] px-3 py-3">
          <PrOptionsForm taskId={taskId} {...(onSaved ? { onSaved } : {})} />
        </div>
      )}
    </div>
  );
}

function PrOptionsForm({
  taskId,
  onSaved,
}: {
  taskId: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [opts, setOpts] = useState<PrOptions | null>(null);
  const [branch, setBranch] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lazy-load when the disclosure opens (this form only mounts when open) - a
  // cheap GET; the form stays usable with empty defaults if it fails.
  useEffect(() => {
    let cancelled = false;
    void api.tasks
      .getPrOptions(taskId)
      .then((o) => {
        if (cancelled) return;
        setOpts(o);
        setBranch(o.branch_name ?? "");
        setTitle(o.pr_title ?? "");
        setBody(o.pr_body ?? "");
      })
      .catch(() => {
        /* form still usable with empty defaults */
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await api.tasks.setPrOptions(taskId, {
        branch_name: branch.trim() || null,
        pr_title: title.trim() || null,
        pr_body: body.trim() || null,
      });
      setOpts(next);
      toast.success(
        next.branch_locked
          ? "PR options saved - the open PR was updated."
          : "PR options saved - they apply when Athena opens the PR.",
      );
      await onSaved?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save PR options.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) {
    return <div className="skeleton h-28 rounded-md" aria-hidden />;
  }
  const locked = opts?.branch_locked ?? false;
  return (
    <Stack gap="2.5">
      <Stack gap="1">
        <span className={LABEL_CLASS}>Branch name</span>
        <input
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          disabled={locked}
          placeholder={opts?.default_branch_name ?? "athena/task-…"}
          className={FIELD_CLASS}
        />
        {locked && (
          <span className="text-xs text-[var(--text-subtle)]">
            The PR is open on{" "}
            <span className="font-mono">{opts?.opened_branch}</span> - the branch
            is locked. Title and description still update the live PR.
          </span>
        )}
      </Stack>
      <Stack gap="1">
        <span className={LABEL_CLASS}>PR title</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Athena composes a title from the task"
          className={FIELD_CLASS}
        />
      </Stack>
      <Stack gap="1">
        <span className={LABEL_CLASS}>Description</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Athena uses the approved plan as the description"
          className={`${FIELD_CLASS} min-h-[80px] resize-y`}
        />
      </Stack>
      <Cluster gap="2">
        <Button size="sm" loading={saving} disabled={saving} onClick={() => void save()}>
          {!saving && <Save className="size-3.5" />}
          Save PR options
        </Button>
      </Cluster>
    </Stack>
  );
}
