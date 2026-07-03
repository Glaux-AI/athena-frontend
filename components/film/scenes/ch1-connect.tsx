"use client";

/**
 * Chapter 01 - Connect.
 * S3 chapter card, S5 ingest hero (312 repos -> living knowledge graph).
 * All product surfaces here are the real components: IngestTimeline,
 * FreshnessPill, EntityGraph - fed film-fixture props as functions of t.
 */

import { useMemo } from "react";

import { IngestTimeline } from "@/components/repo/ingest-timeline";
import type { RepoIngestProgress, IngestStageTransition } from "@/lib/api/client";
import { FreshnessPill } from "@/components/scope/freshness-pill";
import { EntityGraph } from "@/components/topology/entity-graph";
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/api/client";

import { ev, evo, lerp, rand, seg, type SceneDef } from "../engine";
import { AppFrame, Caption, ChapterCard } from "../language";

/* ------------------------------------------------------------- fixture */

const REPO_NAMES = [
  "settlement-service", "reconciliation-engine", "refunds-api", "ledger-core",
  "webhook-gateway", "payments-orchestrator", "kyc-service", "risk-scoring",
  "notifications-hub", "web-dashboard", "mobile-app", "identity-provider",
  "billing-engine", "fx-rates", "dispute-center", "audit-trail",
  "data-warehouse-sync", "feature-flags", "search-indexer", "email-renderer",
];

const TOTAL_REPOS = 312;
const TOTAL_LOC = 14.2; // millions

/** Deterministic per-repo completion time across the 20s scene. */
function repoDoneAt(i: number): number {
  return 3.5 + 14.5 * Math.pow(i / TOTAL_REPOS, 0.82) + rand(i) * 0.4;
}

function repoName(i: number): string {
  const base = REPO_NAMES[i % REPO_NAMES.length];
  return i < REPO_NAMES.length ? base : `${base}-${Math.floor(i / REPO_NAMES.length) + 1}`;
}

/* Graph fixture: 8 domain clusters, ~150 nodes, intra + cross edges. */
const DOMAINS = ["payments", "identity", "ledger", "notifications", "data", "web", "mobile", "infra"];

const GRAPH: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } = (() => {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  let n = 0;
  for (let d = 0; d < DOMAINS.length; d++) {
    const count = 14 + Math.floor(rand(d * 7 + 2) * 8);
    const first = n;
    for (let k = 0; k < count; k++) {
      nodes.push({
        id: `n${n}`,
        node_kind: k === 0 ? "capability" : k < 4 ? "service" : "module",
        name: k === 0 ? DOMAINS[d] : `${repoName(d * 19 + k)}`,
        layer: DOMAINS[d],
        repo_id: `repo_${d}_${k}`,
        tags: [DOMAINS[d]],
        centrality: k === 0 ? 0.9 : 0.15 + rand(n) * 0.5,
      } as KnowledgeNode);
      if (k > 0) {
        edges.push({
          source_id: `n${first + Math.floor(rand(n * 3) * k)}`,
          target_id: `n${n}`,
          kind: "depends_on",
        } as KnowledgeEdge);
      }
      n++;
    }
  }
  // Cross-domain contracts light up late in the scene.
  for (let c = 0; c < 26; c++) {
    const a = Math.floor(rand(c * 13 + 5) * n);
    const b = Math.floor(rand(c * 17 + 9) * n);
    if (a !== b) {
      edges.push({
        source_id: `n${a}`,
        target_id: `n${b}`,
        kind: "api_contract",
        cross_repo: true,
      } as KnowledgeEdge);
    }
  }
  return { nodes, edges };
})();

/* The focused repo's staged ingest progress, as a pure function of t. */
function heroProgress(t: number): RepoIngestProgress {
  const stages: {
    stage: IngestStageTransition["stage"];
    from: number;
    to: number;
    detail: string;
  }[] = [
    { stage: "cloning", from: 2.0, to: 4.0, detail: "meridian-systems/settlement-service @ 8f4c21e" },
    { stage: "parsing", from: 4.0, to: 7.5, detail: "2,148 files · 41,220 symbols mapped" },
    { stage: "embedding", from: 7.5, to: 12.0, detail: "services/settlement/reconciliation_engine.py" },
    { stage: "indexing", from: 12.0, to: 15.5, detail: "Linking cross-repo edges · finalizing blueprints" },
    { stage: "completed", from: 15.5, to: 99, detail: "Blueprint ready" },
  ];
  const cur = stages.find((s) => t >= s.from && t < s.to) ?? stages[stages.length - 1];
  const filesTotal = 2148;
  const p = seg(t, 4.0, 15.5);
  const history: IngestStageTransition[] = stages
    .filter((s) => t >= s.to && s.stage !== "completed")
    .map((s) => ({
      stage: s.stage,
      entered_at: new Date(1783000000000 + s.from * 1000).toISOString(),
      duration_ms: (s.to - s.from) * 1000,
      attempt_duration_ms: (s.to - s.from) * 1000,
      files_total: filesTotal,
      files_processed: filesTotal,
      last_processed_path: null,
      error: null,
    }));
  return {
    repo_id: "repo_settlement",
    current: {
      stage: cur.stage,
      entered_at: new Date(1783000000000 + cur.from * 1000).toISOString(),
      duration_ms: null,
      attempt_duration_ms: (Math.min(t, cur.to) - cur.from) * 1000,
      files_total: filesTotal,
      files_processed: Math.floor(p * filesTotal),
      last_processed_path:
        p < 1 ? "services/settlement/reconciliation_engine.py" : null,
      error: null,
      phase_detail: cur.detail,
    },
    history,
    job_id: "job_film_001",
    branch_sha: "8f4c21ea90",
    last_heartbeat_at: new Date(1783000000000 + t * 1000).toISOString(),
    heartbeat_age_ms: 800,
    files_total: filesTotal,
    files_processed: Math.floor(p * filesTotal),
    last_processed_path: p < 1 ? "services/settlement/reconciliation_engine.py" : null,
  } as RepoIngestProgress;
}

/* --------------------------------------------------------------- scenes */

const S3: SceneDef = {
  id: "s3-ch1-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="01" kicker="Chapter 01" title="Connect" />
  ),
};

function IngestRows({ t }: { t: number }) {
  // Window of repo rows around the completion frontier so the list appears
  // to stream: show 9 rows, frontier row centered.
  const done = Math.min(
    TOTAL_REPOS,
    Math.max(0, Math.floor(TOTAL_REPOS * Math.pow(seg(t, 3.5, 18), 1.15))),
  );
  const start = Math.max(0, Math.min(done - 3, TOTAL_REPOS - 9));
  const rows = Array.from({ length: 9 }, (_, k) => start + k).filter(
    (i) => i < TOTAL_REPOS,
  );
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {rows.map((i) => {
        const doneAt = repoDoneAt(i);
        const p = seg(t, doneAt - 2.2, doneAt);
        const isDone = p >= 1;
        return (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
          >
            <span
              className="truncate font-mono text-[13px] text-[var(--text)]"
              style={{ width: 250 }}
            >
              meridian/{repoName(i)}
            </span>
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
            >
              <div
                className="h-full rounded-full bg-[var(--primary)]"
                style={{ width: `${Math.round(p * 100)}%` }}
              />
            </div>
            <FreshnessPill state={isDone ? "fresh" : p > 0 ? "indexing" : "no_data"} />
          </div>
        );
      })}
    </div>
  );
}

const S5: SceneDef = {
  id: "s5-ingest-hero",
  dur: 20,
  Comp: ({ t }) => {
    const done = Math.min(
      TOTAL_REPOS,
      Math.max(0, Math.floor(TOTAL_REPOS * Math.pow(seg(t, 3.5, 18), 1.15))),
    );
    const loc = (TOTAL_LOC * seg(t, 3.5, 18)).toFixed(1);
    const graphP = seg(t, 2.5, 17.5);
    const nodeCount = Math.max(3, Math.floor(GRAPH.nodes.length * graphP));
    const shown = useMemo(
      () => ({
        nodes: GRAPH.nodes.slice(0, nodeCount),
        edges: GRAPH.edges.filter(
          (e) =>
            parseInt(e.source_id.slice(1)) < nodeCount &&
            parseInt(e.target_id.slice(1)) < nodeCount &&
            (!e.cross_repo || t > 13),
        ),
      }),
      [nodeCount, t > 13],
    );
    const zoomIn = evo(t, 14, 19);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <AppFrame
          frameStyle={{
            transform: `scale(${lerp(1, 1.06, zoomIn)}) translateX(${lerp(0, -120, zoomIn)}px)`,
          }}
        >
          <div className="flex h-full bg-[var(--bg)]">
            {/* Left: ingest progress - real timeline + real pills. */}
            <div
              className="flex flex-col gap-4 border-r border-[var(--border)] p-6"
              style={{ width: 640 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-[var(--text)]">
                    Ingesting meridian-systems
                  </div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {done} / {TOTAL_REPOS} repositories · {loc}M lines
                  </div>
                </div>
                <FreshnessPill
                  state={done >= TOTAL_REPOS ? "fresh" : "indexing"}
                  detail={done >= TOTAL_REPOS ? "312 repositories" : undefined}
                />
              </div>
              <IngestRows t={t} />
              <div className="mt-2">
                <IngestTimeline progress={heroProgress(t)} />
              </div>
            </div>
            {/* Right: the living knowledge graph - real EntityGraph.
                Remount on growth batches so the canvas re-lays-out and
                re-fits to the growing constellation. */}
            <div className="relative flex-1 bg-[var(--surface)]">
              <EntityGraph
                key={Math.floor(nodeCount / 10)}
                nodes={shown.nodes}
                edges={shown.edges}
                height={938}
                emptyTitle="Waiting for the first repository"
                emptyDescription=""
              />
            </div>
          </div>
        </AppFrame>
        <Caption t={t} a={0.5} b={4.5}>
          Point Athena at everything. All of it.
        </Caption>
        <Caption t={t} a={5.5} b={10.5}>
          It reads every repo. Every decision.
        </Caption>
        <Caption t={t} a={15.8} b={19.6}>
          312 / 312 ingested · 14.2M lines · one graph
        </Caption>
      </div>
    );
  },
};

export const CH1_CORE: SceneDef[] = [S3, S5];
