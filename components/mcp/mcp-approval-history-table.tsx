/**
 * McpApprovalHistoryTable - recent tool-call decisions for a server.
 *
 * Server-scoped approval history is sourced from `GET /v1/mcp/{id}/calls`
 * (the BE's `mcp.tool.called` audit stream) because the dedicated
 * approval ledger (`mcp_tool_approvals`) is keyed per-tool. The four
 * decision lobes mirror the FE-canonical `McpRecentCall["status"]`
 * enum: `ok` (auto-allowed), `error` (provider error), `timeout`
 * (no-response), `denied` (approval gate refused).
 *
 * Truncates to the first 20 rows the hook returned; the parent picks
 * the limit and may render a "view all" link later (out of scope here).
 */
import type { McpRecentCall } from "@/lib/api/client";
import { cn } from "@/lib/cn";

type Decision = McpRecentCall["status"];

const DECISION_STYLES: Record<Decision, { label: string; cls: string }> = {
  ok: {
    label: "Allowed",
    cls: "bg-[var(--success-soft)] text-[var(--success-ink)]",
  },
  error: {
    label: "Error",
    cls: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  },
  timeout: {
    label: "Timeout",
    cls: "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
  },
  denied: {
    label: "Denied",
    cls: "bg-[var(--danger-soft)] text-[var(--danger-ink)]",
  },
};

function DecisionChip({ status }: { status: Decision }) {
  const style = DECISION_STYLES[status];
  return (
    <span
      aria-label={`Decision: ${style.label}`}
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style.cls,
      )}
    >
      {style.label}
    </span>
  );
}

export function McpApprovalHistoryTable({
  approvals,
  className,
}: {
  approvals: McpRecentCall[];
  className?: string;
}) {
  if (approvals.length === 0) {
    return (
      <p
        className={cn("text-sm text-[var(--text-muted)]", className)}
        data-testid="mcp-approval-history-empty"
      >
        No approval activity yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full border-collapse text-sm", className)}
        aria-label="MCP approval history"
      >
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
            <th scope="col" className="py-2 pr-3 font-semibold">
              When
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Tool
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Decision
            </th>
            <th scope="col" className="py-2 pr-3 font-semibold">
              Actor
            </th>
          </tr>
        </thead>
        <tbody>
          {approvals.map((row) => (
            <tr
              key={row.id}
              className="border-b border-[var(--border)] transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
            >
              <td
                className="py-2 pr-3 text-xs text-[var(--text-muted)]"
                title={row.created_at}
              >
                {row.when}
              </td>
              <td className="py-2 pr-3 font-mono text-xs">{row.tool_name}</td>
              <td className="py-2 pr-3">
                <DecisionChip status={row.status} />
              </td>
              <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                <span className="block truncate">{row.actor}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
