"use client";

/**
 * BlueprintStructuredBody — renders a Blueprint section's `body_json` as
 * CLICKABLE structure instead of prose (Phase D contract #5).
 *
 * Several sections now ship typed JSON: architecture / overview / portfolio
 * carry a Mermaid diagram (clickable nodes) + scope links; the `derived_*`
 * sections (api_surface / data_models / services / hot_files / entry_points /
 * external_deps) carry `{ items: [...] }` rendered as linked tables; the cap
 * `domain_glossary` carries glossary terms. Every node-bearing row deep-links
 * into the shared node-dossier drawer via `<NodeRefRow>`.
 *
 * Returns `null` when the body_json doesn't match any known structured shape,
 * so the caller falls back to the markdown body.
 */

import { Workflow } from "lucide-react";

import { Stack, Cluster } from "@/components/layout/primitives";
import { KnowledgeMermaid } from "@/components/knowledge/knowledge-mermaid";
import { NodeRefRow, NodeRefChip } from "@/components/knowledge/node-ref-chip";
import { PaginatedDerivedList } from "@/components/blueprint/paginated-derived-list";
import type {
  DerivedItem,
  DerivedListKey,
  MermaidDiagram,
} from "@/lib/api/client";

/** Section keys whose `body_json` is a `{ items: DerivedItem[] }` table. */
const DERIVED_ITEM_SECTIONS = new Set([
  "api_surface",
  "data_models",
  "services",
  "hot_files",
  "entry_points",
  "external_deps",
  // The BE may prefix these with `derived_`.
  "derived_api_surface",
  "derived_data_models",
  "derived_services",
  "derived_hot_files",
  "derived_entry_points",
  "derived_external_deps",
]);

/** Narrative sections that carry a diagram in `body_json` AND prose in
 *  `body_markdown` — the viewer renders BOTH (diagram navigates, prose
 *  explains), so this set is exported for that decision. */
export const DIAGRAM_SECTIONS = new Set(["architecture", "overview", "portfolio"]);

interface BlueprintStructuredBodyProps {
  sectionKey: string;
  bodyJson: Record<string, unknown>;
  /** Blueprint scope — when `repo`/`capability` the node-list + glossary
   *  sections paginate the WHOLE dataset (not just the stored top-N) via
   *  `<PaginatedDerivedList>`. Absent / `org` → the legacy unpaginated map. */
  scope?: "repo" | "capability" | "org" | undefined;
  scopeId?: string | undefined;
}

/** Plural noun per derived list, for the pager summary ("Showing 1–10 of …"). */
const LIST_LABEL: Record<DerivedListKey, string> = {
  api_surface: "endpoints",
  data_models: "tables",
  entry_points: "entry points",
  hot_files: "files",
  external_deps: "dependencies",
  services: "services",
  domain_glossary: "terms",
};

/** Section keys may be stored `derived_`-prefixed; the endpoint list-key is not. */
function toListKey(sectionKey: string): DerivedListKey {
  return sectionKey.replace(/^derived_/, "") as DerivedListKey;
}

type GlossaryItem = { node_id: string; name: string; headline?: string | null; kind: string; aliases?: string[] | null };

/** One glossary row — node ref + curated aliases. Shared by the paginated +
 *  unpaginated paths so they render identically. */
function GlossaryRow({ g }: { g: GlossaryItem }) {
  return (
    <div className="rounded-md">
      <NodeRefRow node={{ node_id: g.node_id, name: g.name, kind: g.kind, path: null }} headline={g.headline ?? null} />
      {g.aliases && g.aliases.length > 0 && (
        <Cluster gap="1" align="center" className="mt-1.5 flex-wrap pl-1">
          <span className="text-[10px] uppercase tracking-wider text-[var(--text-subtle)]">aka</span>
          {g.aliases.map((a) => (
            <span key={a} className="rounded-full bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">{a}</span>
          ))}
        </Cluster>
      )}
    </div>
  );
}

/** Returns true when this section_key + body_json can render as structure. */
export function hasStructuredBody(sectionKey: string, bodyJson: Record<string, unknown> | null): boolean {
  if (!bodyJson) return false;
  if (DIAGRAM_SECTIONS.has(sectionKey) && typeof bodyJson.mermaid === "string" && bodyJson.mermaid) return true;
  if (sectionKey === "domain_glossary" && Array.isArray(bodyJson.items)) return true;
  if (DERIVED_ITEM_SECTIONS.has(sectionKey) && Array.isArray(bodyJson.items)) return true;
  // Architecture body can carry hubs/services without a diagram.
  if (sectionKey === "architecture" && (Array.isArray(bodyJson.hubs) || Array.isArray(bodyJson.services) || Array.isArray(bodyJson.entry_points))) return true;
  return false;
}

export function BlueprintStructuredBody({ sectionKey, bodyJson, scope, scopeId }: BlueprintStructuredBodyProps) {
  const diagram = bodyJson as MermaidDiagram;
  const hasDiagram = typeof diagram.mermaid === "string" && !!diagram.mermaid;
  // Node-list + glossary sections paginate the WHOLE dataset when we know the
  // owning scope; `org` / missing scope keeps the legacy in-place map.
  const pageScope = scope === "repo" || scope === "capability" ? scope : null;

  // Glossary.
  if (sectionKey === "domain_glossary" && Array.isArray(bodyJson.items)) {
    const items = bodyJson.items as GlossaryItem[];
    if (pageScope && scopeId) {
      return (
        <PaginatedDerivedList
          scope={pageScope}
          scopeId={scopeId}
          listKey="domain_glossary"
          initialItems={items as DerivedItem[]}
          label="terms"
          data-testid="blueprint-glossary"
          renderItem={(it) => <GlossaryRow key={it.node_id} g={it as unknown as GlossaryItem} />}
        />
      );
    }
    return (
      <Stack gap="2" data-testid="blueprint-glossary">
        {items.map((g) => <GlossaryRow key={g.node_id} g={g} />)}
      </Stack>
    );
  }

  // Derived item tables.
  if (DERIVED_ITEM_SECTIONS.has(sectionKey) && Array.isArray(bodyJson.items)) {
    const items = bodyJson.items as DerivedItem[];
    const listKey = toListKey(sectionKey);
    if (pageScope && scopeId) {
      return (
        <PaginatedDerivedList
          scope={pageScope}
          scopeId={scopeId}
          listKey={listKey}
          initialItems={items}
          label={LIST_LABEL[listKey]}
          data-testid="blueprint-derived-items"
          renderItem={(it) => (
            <NodeRefRow
              key={it.node_id}
              node={{ node_id: it.node_id, name: it.name, kind: it.kind, path: it.path ?? null }}
              headline={it.headline ?? null}
            />
          )}
        />
      );
    }
    if (items.length === 0) {
      return <p className="text-sm text-[var(--text-muted)]">No items derived for this section yet.</p>;
    }
    return (
      <Stack gap="1.5" data-testid="blueprint-derived-items">
        {items.map((it) => (
          <NodeRefRow
            key={it.node_id}
            node={{ node_id: it.node_id, name: it.name, kind: it.kind, path: it.path ?? null }}
            headline={it.headline ?? null}
          />
        ))}
      </Stack>
    );
  }

  // Diagram sections (architecture / overview / portfolio).
  const arch = bodyJson as {
    hubs?: Array<{ node_id: string; name: string; kind: string; path: string }>;
    entry_points?: Array<{ node_id: string; name: string; path: string }>;
    services?: Array<{ node_id: string; name: string; summary?: string | null }>;
  };
  return (
    <Stack gap="4" data-testid="blueprint-diagram-body">
      {hasDiagram && (
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Workflow className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-xs text-[var(--text-muted)]">click a diagram node to open its dossier</span>
          </Cluster>
          <KnowledgeMermaid chart={diagram.mermaid!} nodeMap={diagram.mermaid_nodes} />
        </Stack>
      )}
      {arch.hubs && arch.hubs.length > 0 && (
        <Group title="Hubs">
          {arch.hubs.map((h) => (
            <NodeRefChip key={h.node_id} node={{ node_id: h.node_id, name: h.name, kind: h.kind, path: h.path }} />
          ))}
        </Group>
      )}
      {arch.entry_points && arch.entry_points.length > 0 && (
        <Group title="Entry points">
          {arch.entry_points.map((e) => (
            <NodeRefChip key={e.node_id} node={{ node_id: e.node_id, name: e.name, kind: "entry_point", path: e.path }} />
          ))}
        </Group>
      )}
      {arch.services && arch.services.length > 0 && (
        <Group title="Services">
          {arch.services.map((s) => (
            <NodeRefChip key={s.node_id} node={{ node_id: s.node_id, name: s.name, kind: "service" }} />
          ))}
        </Group>
      )}
    </Stack>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="2">
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{title}</span>
      <Cluster gap="1.5" align="center" className="flex-wrap">{children}</Cluster>
    </Stack>
  );
}
