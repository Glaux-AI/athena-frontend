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
import { Pill, type PillTone } from "@/components/ui/pill";
import { cn } from "@/lib/cn";

type Decision = McpRecentCall["status"];

const DECISION_STYLES: Record<Decision, { label: string; tone: PillTone }> = {
  ok: { label: "Allowed", tone: "success" },
  error: { label: "Error", tone: "danger" },
  timeout: { label: "Timeout", tone: "warning" },
  denied: { label: "Denied", tone: "danger" },
};

function DecisionChip({ status }: { status: Decision }) {
  const style = DECISION_STYLES[status];
  return (
    <Pill aria-label={`Decision: ${style.label}`} tone={style.tone} size="sm">
      {style.label}
    </Pill>
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
          <tr className="border-b border-[var(--border-strong)] text-left text-micro font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
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
              className="border-b border-[var(--border-soft)] transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
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
