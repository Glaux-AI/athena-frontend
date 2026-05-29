/**
 * McpToolCatalogueTable — read-only catalogue of an MCP server's tools.
 *
 * Each row: tool name, description (truncated), risk-level pill, and a
 * "requires approval" check icon (set true whenever the tool's approval
 * policy is anything other than the FE-canonical "none" — `per_session`
 * and `per_call` both gate at least one human prompt).
 *
 * Empty state renders an in-card hint so the section doesn't collapse
 * into the table caption.
 */
import { Check, Minus } from "lucide-react";

import type { McpTool, McpToolRisk } from "@/lib/api/client";
import { cn } from "@/lib/cn";

const RISK_STYLES: Record<McpToolRisk, { label: string; cls: string }> = {
  read:        { label: "Read",        cls: "bg-[var(--surface-2)] text-[var(--text-muted)]" },
  write:       { label: "Write",       cls: "bg-[var(--warning-soft)] text-[var(--warning)]" },
  destructive: { label: "Destructive", cls: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

function RiskBadge({ risk }: { risk: McpToolRisk }) {
  const style = RISK_STYLES[risk];
  return (
    <span
      aria-label={`Risk level: ${style.label}`}
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        style.cls,
      )}
    >
      {style.label}
    </span>
  );
}

function requiresApproval(tool: McpTool): boolean {
  // `none` is the only policy that bypasses any human gate; the other
  // two (`per_session`, `per_call`) both prompt at least once.
  return tool.approval !== "none";
}

export function McpToolCatalogueTable({
  tools,
  className,
}: {
  tools: McpTool[];
  className?: string;
}) {
  if (tools.length === 0) {
    return (
      <p
        className={cn("text-sm text-[var(--text-muted)]", className)}
        data-testid="mcp-tool-catalogue-empty"
      >
        This server hasn&apos;t advertised any tools yet.
      </p>
    );
  }

  return (
    <table
      className={cn("w-full border-collapse text-sm", className)}
      aria-label="MCP tool catalogue"
    >
      <thead>
        <tr className="border-b border-[var(--border)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
          <th scope="col" className="py-2 pr-3 font-semibold">Description</th>
          <th scope="col" className="py-2 pr-3 font-semibold">Risk</th>
          <th scope="col" className="py-2 pr-3 font-semibold">Approval</th>
        </tr>
      </thead>
      <tbody>
        {tools.map((tool) => {
          const needs = requiresApproval(tool);
          return (
            <tr
              key={tool.id}
              className="border-b border-[var(--border)] last:border-b-0 align-top"
            >
              <td className="py-2 pr-3 font-mono text-xs">{tool.name}</td>
              <td className="py-2 pr-3 text-xs text-[var(--text-muted)]">
                <span className="line-clamp-2 break-words">{tool.description}</span>
              </td>
              <td className="py-2 pr-3">
                <RiskBadge risk={tool.risk} />
              </td>
              <td className="py-2 pr-3">
                {needs ? (
                  <Check
                    className="size-4 text-[var(--warning)]"
                    aria-label="Requires approval"
                  />
                ) : (
                  <Minus
                    className="size-4 text-[var(--text-subtle)]"
                    aria-label="No approval required"
                  />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
