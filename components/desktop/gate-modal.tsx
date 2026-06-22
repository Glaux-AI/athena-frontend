"use client";

// GateModal - the single human approval surface for the AI's own tools. It mirrors the
// cockpit's Approve / Request-changes composer: a write/apply/commit renders its unified diff;
// an exec renders the resolved argv + cwd + policy tier; delete/Tier-2/Tier-3 require a typed
// confirmation slug. The mutation in main is physically downstream of the resolved gate Promise,
// so a compromised renderer cannot fabricate approval - it can only deny. NEVER fronts the
// human terminal. Renders nothing until main pushes a pending gate.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileDiff, ShieldAlert, TerminalSquare, X } from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { GateKind, GatePending, GateResolve } from "@/lib/desktop/types";

const KIND_LABEL: Record<GateKind, string> = {
  write_file: "Write file",
  apply_diff: "Apply diff",
  delete_file: "Delete file",
  exec: "Run command",
  git: "Git mutation",
};

const TIER_LABEL: Record<number, string> = {
  1: "Tier 1 · read-only",
  2: "Tier 2 · review",
  3: "Tier 3 · restricted",
};

function isDiffKind(kind: GateKind): boolean {
  return kind === "write_file" || kind === "apply_diff" || kind === "git";
}

function DiffBody({ patch }: { patch: string }) {
  const lines = useMemo(() => patch.split("\n"), [patch]);
  return (
    <pre className="gate-diff" aria-label="Unified diff">
      {lines.map((line, i) => {
        let cls = "diff-ctx";
        if (line.startsWith("@@")) cls = "diff-hunk";
        else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff --git"))
          cls = "diff-meta";
        else if (line.startsWith("+")) cls = "diff-add";
        else if (line.startsWith("-")) cls = "diff-del";
        return (
          <span key={i} className={`diff-line ${cls}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

export function GateModal() {
  const [pending, setPending] = useState<GatePending | null>(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmError, setConfirmError] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDesktop) return;
    const off = athena.gate.onPending((g: GatePending) => {
      setPending(g);
      setNote("");
      setConfirm("");
      setConfirmError(false);
      setBusy(false);
    });
    return off;
  }, []);

  useEffect(() => {
    if (pending) dialogRef.current?.focus();
  }, [pending]);

  const reset = useCallback(() => {
    setPending(null);
    setNote("");
    setConfirm("");
    setConfirmError(false);
    setBusy(false);
  }, []);

  const resolve = useCallback(
    async (decision: "approve" | "reject") => {
      if (!pending || busy) return;

      if (decision === "approve" && pending.requiresTypedConfirm) {
        const expected = pending.confirmSlug ?? "";
        if (confirm.trim() !== expected) {
          setConfirmError(true);
          return;
        }
      }

      setBusy(true);
      try {
        // Build the payload omitting absent optionals (exactOptionalPropertyTypes).
        const payload: GateResolve = { id: pending.id, decision };
        const trimmedNote = note.trim();
        if (trimmedNote) payload.note = trimmedNote;
        if (pending.requiresTypedConfirm) payload.typedConfirm = confirm.trim();
        await athena.gate.resolve(payload);
        reset();
      } catch {
        setBusy(false);
      }
    },
    [pending, busy, confirm, note, reset],
  );

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        void resolve("reject");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, resolve]);

  if (!pending) return null;

  const diff = isDiffKind(pending.kind) && pending.patch;
  const isExec = pending.kind === "exec";
  const tierClass = `gate-tier-${pending.tier}`;
  const approveDisabled =
    busy || (pending.requiresTypedConfirm && confirm.trim() !== (pending.confirmSlug ?? ""));

  return (
    <div
      className="gate-overlay"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && void resolve("reject")}
    >
      <div
        ref={dialogRef}
        className={`gate-modal ${tierClass}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Approve ${KIND_LABEL[pending.kind]}`}
        tabIndex={-1}
      >
        <header className="gate-header">
          <div className="gate-header-title">
            {diff ? (
              <FileDiff size={16} aria-hidden />
            ) : isExec ? (
              <TerminalSquare size={16} aria-hidden />
            ) : (
              <ShieldAlert size={16} aria-hidden />
            )}
            <span className="gate-kind">{KIND_LABEL[pending.kind]}</span>
            {pending.taskDisplayId ? <span className="gate-task">{pending.taskDisplayId}</span> : null}
          </div>
          <span className={`gate-tier-badge tier-${pending.tier}`}>
            {TIER_LABEL[pending.tier] ?? `Tier ${pending.tier}`}
          </span>
        </header>

        <p className="gate-summary">{pending.summary}</p>

        {pending.tier === 3 ? (
          <div className="gate-banner gate-banner-danger" role="alert">
            <AlertTriangle size={14} aria-hidden /> This is a restricted (Tier 3) action. Approve only
            if you are certain.
          </div>
        ) : null}

        <div className="gate-body">
          {diff ? (
            <DiffBody patch={pending.patch as string} />
          ) : isExec ? (
            <div className="gate-exec">
              <code className="gate-argv" aria-label="Resolved command">
                {(pending.argv ?? []).map((arg, i) => (
                  <span key={i} className="gate-arg">
                    {arg}
                  </span>
                ))}
              </code>
              {pending.cwd ? <div className="gate-cwd">cwd: {pending.cwd}</div> : null}
            </div>
          ) : (
            <div className="gate-plain">
              {pending.argv && pending.argv.length > 0 ? (
                <code className="gate-argv">
                  {pending.argv.map((arg, i) => (
                    <span key={i} className="gate-arg">
                      {arg}
                    </span>
                  ))}
                </code>
              ) : (
                <p className="gate-plain-note">Review the summary above before approving.</p>
              )}
            </div>
          )}
        </div>

        {pending.requiresTypedConfirm ? (
          <label className="gate-confirm">
            <span className="gate-confirm-label">
              Type <code>{pending.confirmSlug}</code> to confirm
            </span>
            <input
              className={`gate-confirm-input${confirmError ? " is-error" : ""}`}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                if (confirmError) setConfirmError(false);
              }}
              placeholder={pending.confirmSlug}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={confirmError}
            />
            {confirmError ? <span className="gate-confirm-error">Confirmation does not match.</span> : null}
          </label>
        ) : null}

        <label className="gate-note">
          <span className="gate-note-label">Note (sent with request changes)</span>
          <textarea
            className="gate-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional. Tell the agent what to change."
            rows={2}
          />
        </label>

        <footer className="gate-actions">
          <button
            type="button"
            className="gate-btn gate-btn-reject"
            disabled={busy}
            onClick={() => void resolve("reject")}
          >
            <X size={14} aria-hidden /> Request changes
          </button>
          <button
            type="button"
            className="gate-btn gate-btn-approve"
            disabled={approveDisabled}
            onClick={() => void resolve("approve")}
          >
            <Check size={14} aria-hidden /> Approve
          </button>
        </footer>
      </div>
    </div>
  );
}
