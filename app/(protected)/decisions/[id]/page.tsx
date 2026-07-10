"use client";

/**
 * /decisions/[id] - unified decision-detail page.
 *
 * Reachable from the ADRs-referenced card on the repo route and from
 * the org Decisions tab (stale-decision banner rows + list rows). The
 * BE `GET /v1/decisions/{id}` probes the three scope tables in order
 * and returns whichever hit (`org` / `domain` / `repo`), so this
 * route can render any decision without the caller knowing the scope.
 */

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, FileText, ScrollText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type DecisionDetail } from "@/lib/api/client";

const KIND_TONE: Record<DecisionDetail["kind"], PillTone> = {
  ADR:           "primary",
  Convention:    "info",
  "Domain note": "neutral",
};

const STATUS_TONE: Record<DecisionDetail["status"], PillTone> = {
  active:     "success",
  superseded: "neutral",
  reverted:   "warning",
};

export default function DecisionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [decision, setDecision] = useState<DecisionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setDecision(await api.decisions.detail(id));
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load decision");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <LoadingSkeleton />;
  if (error || !decision) {
    return (
      <EmptyState
        icon={<ScrollText className="size-6" aria-hidden />}
        title="Decision not found."
        description={error ?? "The decision id is not present in any scope table."}
      />
    );
  }

  const scopeHref = scopeLink(decision);
  const scopeCtaLabel = scopeCta(decision.scope);

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Link
          href="/knowledge"
          className="inline-flex w-fit items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <ArrowLeft className="size-3" />
          Decisions
        </Link>
        <Cluster gap="2" align="center">
          <Eyebrow>{decision.scope}</Eyebrow>
          <Eyebrow aria-hidden>·</Eyebrow>
          <Eyebrow>{decision.scope_label}</Eyebrow>
        </Cluster>
        <Cluster gap="3" align="center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
            <ScrollText className="size-5" />
          </div>
          <Stack gap="0">
            <Cluster gap="2" align="center">
              <h1 className="text-2xl font-semibold tracking-tight">{decision.title}</h1>
              {decision.tag && (
                <code className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-micro">
                  {decision.tag}
                </code>
              )}
              <Pill size="sm" tone={STATUS_TONE[decision.status]}>{decision.status}</Pill>
            </Cluster>
            <span className="text-sm text-[var(--text-muted)]">{decision.author} · {decision.date}</span>
          </Stack>
        </Cluster>
      </Stack>

      <Card variant="elevated">
        <Stack gap="3">
          <div>
            <Cluster gap="2" align="center" className="pb-3">
              <FileText className="size-4 text-[var(--text-muted)]" aria-hidden />
              <span className="text-sm font-semibold">Summary</span>
              <Pill size="sm" tone={KIND_TONE[decision.kind]} className="ml-auto">{decision.kind}</Pill>
            </Cluster>
            <hr className="hr-horizon" aria-hidden="true" />
          </div>
          {decision.summary ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
              {decision.summary}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">No summary recorded.</p>
          )}
        </Stack>
      </Card>

      {(decision.supersedes_id || decision.superseded_by_id) && (
        <Card>
          <Stack gap="2">
            <span className="text-sm font-semibold">Supersession chain</span>
            {decision.supersedes_id && (
              <Link
                href={`/decisions/${encodeURIComponent(decision.supersedes_id)}`}
                className="inline-flex w-fit items-center gap-1 text-xs text-[var(--primary)] no-underline hover:underline"
              >
                <ArrowLeft className="size-3" /> Supersedes <code className="font-mono">{decision.supersedes_id}</code>
              </Link>
            )}
            {decision.superseded_by_id && (
              <Link
                href={`/decisions/${encodeURIComponent(decision.superseded_by_id)}`}
                className="inline-flex w-fit items-center gap-1 text-xs text-[var(--primary)] no-underline hover:underline"
              >
                Superseded by <code className="font-mono">{decision.superseded_by_id}</code> <ArrowUpRight className="size-3" />
              </Link>
            )}
          </Stack>
        </Card>
      )}

      {scopeHref && (
        <Button size="sm" variant="secondary" asChild className="w-fit">
          <Link href={scopeHref} className="no-underline">
            {scopeCtaLabel}
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </Button>
      )}
    </Stack>
  );
}

/** Build the "Open scope" link target for the CTA. Org-scope decisions
 *  send the user to the org Decisions tab (the `/knowledge` page also
 *  surfaces decisions today); domain + repo scopes deep-link to
 *  the canonical Decisions tab on their detail route. */
function scopeLink(d: DecisionDetail): string | null {
  if (d.scope === "domain" && d.scope_id) {
    return `/domains/${encodeURIComponent(d.scope_id)}?tab=decisions`;
  }
  if (d.scope === "repo" && d.scope_id) {
    // Repo decisions live on the per-cap-per-repo route; without the
    // domain_id we can only point the user at the org Decisions
    // surface. The link copy spells this out so the user isn't left
    // wondering why no repo page opens.
    return null;
  }
  return "/knowledge";
}

function scopeCta(scope: DecisionDetail["scope"]): string {
  if (scope === "domain") return "Open domain decisions";
  if (scope === "repo") return "Open repo decisions";
  return "Open org decisions";
}

function LoadingSkeleton() {
  return (
    <Stack gap="6" aria-busy="true" aria-label="Loading decision">
      <Stack gap="1">
        <div className="h-3 w-24 skeleton rounded-md" />
        <div className="h-3 w-40 skeleton rounded-md" />
        <Cluster gap="3" align="center">
          <div className="size-10 skeleton rounded-lg" />
          <Stack gap="1">
            <div className="h-7 w-72 skeleton rounded-md" />
            <div className="h-4 w-48 skeleton rounded-md" />
          </Stack>
        </Cluster>
      </Stack>
      <div className="h-32 w-full skeleton rounded-md" />
      <div className="h-20 w-full skeleton rounded-md" />
    </Stack>
  );
}
