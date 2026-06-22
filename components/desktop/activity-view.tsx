"use client";

// ActivityView: the local audit-log surface.
//
// Renders the hash-chained, append-only audit rows from `athena.audit.list(orgId)`: every AI
// file/exec/git action with its gate decision, tool, paths-only args, exit code and duration.
// This is the LOCAL audit + executor history, distinct from the cloud /activity. It never
// shows org knowledge - only what the AI did on THIS machine.

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleSlash,
  FileEdit,
  GitCommitHorizontal,
  RefreshCw,
  ShieldCheck,
  Terminal as TerminalIcon,
  Trash2,
} from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { AuditRow } from "@/lib/desktop/types";

interface ActivityViewProps {
  /** The active org id (from `athena.auth.status`); the audit log is partitioned by org. */
  orgId: string | null;
}

const PAGE_LIMIT = 200;

export function ActivityView({ orgId }: ActivityViewProps) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isDesktop || !orgId) {
      setRows([]);
      return;
    }
    setError(null);
    try {
      const list = await athena.audit.list(orgId, PAGE_LIMIT);
      setRows([...list].sort((a, b) => b.ts.localeCompare(a.ts)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the audit log");
      setRows([]);
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (rows === null) return <ActivitySkeleton />;

  return (
    <div style={{ maxWidth: "56rem", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", marginBottom: "1rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text)" }}>
            Activity
          </h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
            Every AI file, exec and git action on this device. Append-only and hash-chained.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} style={refreshButtonStyle}>
          <RefreshCw size={14} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {error ? (
        <div role="alert" style={errorStyle}>
          {error}
        </div>
      ) : null}

      {!orgId ? (
        <EmptyState message="Select an org to see its local activity." />
      ) : rows.length === 0 ? (
        <EmptyState message="No AI actions recorded on this device yet." />
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.375rem",
          }}
        >
          {rows.map((row, i) => (
            <AuditRowItem key={`${row.rowHash}-${i}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AuditRowItem({ row }: { row: AuditRow }) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.625rem",
        padding: "0.5625rem 0.75rem",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <ToolIcon tool={row.tool} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 500, color: "var(--text)", fontSize: "0.8125rem" }}>
            {row.tool}
          </span>
          <DecisionBadge decision={row.decision} />
          {row.taskId ? (
            <span style={metaStyle} title="task">
              {row.taskId}
              {row.stage ? ` · ${row.stage}` : ""}
            </span>
          ) : null}
          <span style={{ ...metaStyle, marginLeft: "auto" }} title={row.ts}>
            {formatTs(row.ts)}
          </span>
        </div>

        {row.argsPathsOnly.length > 0 ? (
          <p
            style={{
              margin: "0.25rem 0 0",
              fontFamily: "var(--font-jetbrains, ui-monospace, monospace)",
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              wordBreak: "break-word",
            }}
          >
            {row.argsPathsOnly.join("  ")}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
          <span style={metaStyle}>{row.agentRuntime}</span>
          {typeof row.exitCode === "number" ? (
            <span style={{ ...metaStyle, color: row.exitCode === 0 ? "var(--success)" : "var(--danger)" }}>
              exit {row.exitCode}
            </span>
          ) : null}
          {typeof row.durationMs === "number" ? (
            <span style={metaStyle}>{formatDuration(row.durationMs)}</span>
          ) : null}
          {row.diffSha ? (
            <span style={metaStyle} title="content hash of the applied diff">
              diff {row.diffSha.slice(0, 7)}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const iconProps = {
    size: 16,
    "aria-hidden": true as const,
    style: { color: "var(--text-muted)", marginTop: 1, flex: "none" as const },
  };
  if (tool.startsWith("write") || tool.startsWith("apply")) return <FileEdit {...iconProps} />;
  if (tool.startsWith("delete")) return <Trash2 {...iconProps} />;
  if (tool.startsWith("exec")) return <TerminalIcon {...iconProps} />;
  if (tool.startsWith("git")) return <GitCommitHorizontal {...iconProps} />;
  return <ShieldCheck {...iconProps} />;
}

function DecisionBadge({ decision }: { decision: AuditRow["decision"] }) {
  const map: Record<AuditRow["decision"], { label: string; color: string; Icon: typeof CheckCircle2 }> = {
    approve: { label: "approved", color: "var(--success)", Icon: CheckCircle2 },
    auto: { label: "auto (tier 1)", color: "var(--text-muted)", Icon: ShieldCheck },
    reject: { label: "rejected", color: "var(--danger)", Icon: CircleSlash },
  };
  const { label, color, Icon } = map[decision];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "0.6875rem",
        color,
        border: `1px solid color-mix(in oklch, ${color} 40%, var(--border))`,
        borderRadius: "999px",
        padding: "0 0.375rem",
        lineHeight: "1.125rem",
      }}
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "3rem 1.5rem",
        border: "1px dashed var(--border)",
        borderRadius: "10px",
        background: "var(--surface)",
      }}
    >
      <ShieldCheck size={28} aria-hidden="true" style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }} />
      <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-muted)" }}>{message}</p>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div aria-hidden="true" style={{ maxWidth: "56rem", margin: "0 auto" }}>
      <div style={{ ...skeletonBlock, width: "30%", height: "1.25rem", marginBottom: "1rem" }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} style={{ ...skeletonBlock, height: "3.25rem", marginBottom: "0.375rem" }} />
      ))}
    </div>
  );
}

function formatTs(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

const metaStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  color: "var(--text-muted)",
};

const refreshButtonStyle: React.CSSProperties = {
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  height: "2rem",
  padding: "0 0.75rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  fontSize: "0.8125rem",
  cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  marginBottom: "1rem",
  padding: "0.625rem 0.75rem",
  borderRadius: "8px",
  border: "1px solid color-mix(in oklch, var(--danger) 40%, var(--border))",
  background: "color-mix(in oklch, var(--danger) 10%, transparent)",
  color: "var(--danger)",
  fontSize: "0.8125rem",
};

const skeletonBlock: React.CSSProperties = {
  borderRadius: "8px",
  background: "color-mix(in oklch, var(--text-muted) 12%, transparent)",
};
