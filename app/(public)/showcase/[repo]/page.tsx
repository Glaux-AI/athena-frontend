"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { ApiError } from "@/lib/api/client";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import {
  showcaseApi,
  type ShowcaseNodeDossier,
  type ShowcaseRepoDetail,
  type ShowcaseTreeNode,
} from "@/lib/api/public-client";
import { ShowcaseBlueprint } from "@/components/showcase/showcase-blueprint";
import { ShowcaseComponents } from "@/components/showcase/showcase-components";
import { ShowcaseKnowledgeExplorerButton } from "@/components/showcase/showcase-knowledge-explorer";
import { ShowcaseMetricsBar } from "@/components/showcase/showcase-metrics";
import { ShowcaseNodeView } from "@/components/showcase/showcase-node-view";
import { ShowcaseTree } from "@/components/showcase/showcase-tree";
import { EmptyState } from "@/components/ui/empty-state";

export default function ShowcaseRepoPage() {
  const params = useParams<{ repo: string }>();
  const ref = Array.isArray(params.repo) ? params.repo[0] : params.repo;

  const [detail, setDetail] = useState<ShowcaseRepoDetail | null>(null);
  const [tree, setTree] = useState<ShowcaseTreeNode | null>(null);
  const [node, setNode] = useState<ShowcaseNodeDossier | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(null);
    Promise.all([showcaseApi.repo(ref), showcaseApi.tree(ref)])
      .then(([d, t]) => {
        if (!alive) return;
        setDetail(d);
        setTree(t);
      })
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Could not load this repo."));
    return () => {
      alive = false;
    };
  }, [ref]);

  const openNode = useCallback(
    async (id: string) => {
      setSelectedKey(id);
      setNodeLoading(true);
      try {
        setNode(await showcaseApi.node(ref, id));
      } catch {
        setNode(null);
      } finally {
        setNodeLoading(false);
      }
    },
    [ref],
  );

  const selectTreeNode = useCallback(
    (tn: ShowcaseTreeNode) => {
      if (tn.kind === "repo") {
        setSelectedKey(null);
        setNode(null);
      } else if (tn.node_id) {
        void openNode(tn.node_id);
      }
    },
    [openNode],
  );

  const backToBlueprint = useCallback(() => {
    setSelectedKey(null);
    setNode(null);
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-20">
        <EmptyState
          title="Repository unavailable"
          description={error}
          action={
            <Link href="/showcase" className="text-sm font-medium text-[var(--primary)] hover:underline">
              Back to all repositories
            </Link>
          }
        />
      </main>
    );
  }

  if (!detail) return <RepoSkeleton />;

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 lg:px-8">
      <div className="flex flex-col gap-5 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/showcase"
              className={cn(
                "inline-flex items-center gap-1 rounded-sm text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]",
                focusRing,
              )}
            >
              <ArrowLeft className="size-3.5" aria-hidden /> All repositories
            </Link>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--text)]">
              <span className="text-[var(--text-subtle)]">{detail.owner}/</span>
              {detail.name}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ShowcaseKnowledgeExplorerButton repoRef={ref} detail={detail} tree={tree} />
            <a
              href={`https://github.com/${detail.full_name}`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-2)]",
                focusRing,
              )}
            >
              View on GitHub <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
        <ShowcaseMetricsBar metrics={detail.metrics} />
        <hr className="hr-horizon" aria-hidden />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-auto lg:pr-2">
          {tree ? (
            <ShowcaseTree root={tree} selectedKey={selectedKey} onSelect={selectTreeNode} />
          ) : (
            <div className="skeleton h-64" aria-hidden />
          )}
        </aside>

        <div className="min-w-0">
          {selectedKey !== null ? (
            nodeLoading ? (
              <NodePaneSkeleton />
            ) : node ? (
              <ShowcaseNodeView node={node} onBack={backToBlueprint} onNav={openNode} />
            ) : (
              <EmptyState title="Node not found" description="This node has no dossier yet." />
            )
          ) : (
            <>
              <ShowcaseBlueprint summary={detail.summary} sections={detail.sections} onNode={openNode} />
              <ShowcaseComponents components={detail.components} onNode={openNode} />
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function RepoSkeleton() {
  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 lg:px-8" aria-hidden>
      <div className="flex flex-col gap-4 pb-6">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-14 w-full max-w-xl" />
        <hr className="hr-horizon" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="skeleton h-64" />
        <div className="skeleton h-96" />
      </div>
    </main>
  );
}

function NodePaneSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-32 w-full" />
    </div>
  );
}
