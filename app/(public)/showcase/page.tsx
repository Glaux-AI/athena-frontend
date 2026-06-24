"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api/client";
import { showcaseApi, type ShowcaseRepoSummary } from "@/lib/api/public-client";
import { ShowcaseRepoCard } from "@/components/showcase/showcase-repo-card";
import { EmptyState } from "@/components/ui/empty-state";

export default function ShowcaseIndexPage() {
  const [repos, setRepos] = useState<ShowcaseRepoSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    showcaseApi
      .listRepos()
      .then((r) => alive && setRepos(r))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "Could not load the showcase."));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-12 lg:px-8">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-[var(--text)] sm:text-4xl">
          See how Athena understands real codebases
        </h1>
        <p className="mt-4 text-balance text-base leading-relaxed text-[var(--text-muted)]">
          Athena read these open-source projects end to end and generated a structured blueprint of
          each: its architecture, services, APIs, data models, and a dossier for every file. Pick one
          and explore the knowledge it built.
        </p>
      </header>

      <section className="mt-12">
        {error ? (
          <EmptyState title="Couldn't load the showcase" description={error} />
        ) : repos === null ? (
          <CardGridSkeleton />
        ) : repos.length === 0 ? (
          <EmptyState
            title="No repositories yet"
            description="The showcase is being prepared. Check back soon."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo) => (
              <ShowcaseRepoCard key={repo.repo_id} repo={repo} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function CardGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-2)]"
        />
      ))}
    </div>
  );
}
