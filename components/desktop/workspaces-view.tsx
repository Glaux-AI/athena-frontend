"use client";

// WorkspacesView: the local workspace + repo surface.
//
// Lists workspaces (`athena.workspace.list`), creates one bound to the active org
// (`athena.workspace.create`), and clones repos into it (`athena.workspace.cloneRepo`) while
// streaming `git clone` progress over `athena.workspace.onCloneLine`. Repo freshness vs the
// org's `indexed_sha` is a hint (NOT a sync field). Local checkouts on this device only.

import { useCallback, useEffect, useRef, useState } from "react";
import { FolderGit2, GitBranch, GitFork, Loader2, Plus, RefreshCw } from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { RepoEntry, Workspace } from "@/lib/desktop/types";

interface WorkspacesViewProps {
  /** The active org id (from `athena.auth.status`); new workspaces bind to it. */
  orgId: string | null;
}

export function WorkspacesView({ orgId }: WorkspacesViewProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rootPath, setRootPath] = useState("");
  const [cloneTarget, setCloneTarget] = useState<{ workspaceId: string; fullName: string } | null>(
    null,
  );
  const [cloneFullName, setCloneFullName] = useState("");
  const [cloneLines, setCloneLines] = useState<string[]>([]);
  const cloneScrollRef = useRef<HTMLPreElement>(null);

  const refresh = useCallback(async () => {
    if (!isDesktop) {
      setWorkspaces([]);
      return;
    }
    setError(null);
    try {
      setWorkspaces(await athena.workspace.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspaces");
      setWorkspaces([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isDesktop) return;
    const off = athena.workspace.onCloneLine((line) => {
      setCloneLines((prev) => {
        const next = [...prev, line];
        return next.length > 500 ? next.slice(-500) : next;
      });
    });
    return off;
  }, []);

  useEffect(() => {
    const el = cloneScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cloneLines]);

  const createWorkspace = useCallback(async () => {
    const trimmed = rootPath.trim();
    if (!trimmed || !orgId) return;
    setBusy(true);
    setError(null);
    try {
      await athena.workspace.create(trimmed, orgId);
      setRootPath("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the workspace");
    } finally {
      setBusy(false);
    }
  }, [rootPath, orgId, refresh]);

  const cloneRepo = useCallback(
    async (workspaceId: string) => {
      const fullName = cloneFullName.trim();
      if (!fullName) return;
      setCloneTarget({ workspaceId, fullName });
      setCloneLines([]);
      setBusy(true);
      setError(null);
      try {
        const repo: RepoEntry = await athena.workspace.cloneRepo({ workspaceId, fullName });
        setCloneLines((prev) => [...prev, `Cloned ${repo.fullName} -> ${repo.localPath}`]);
        setCloneFullName("");
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not clone ${fullName}`);
      } finally {
        setBusy(false);
        setCloneTarget(null);
      }
    },
    [cloneFullName, refresh],
  );

  if (workspaces === null) return <WorkspacesSkeleton />;

  return (
    <div style={{ maxWidth: "52rem", margin: "0 auto" }}>
      <Header onRefresh={() => void refresh()} />

      {error ? <ErrorBanner message={error} /> : null}

      <section style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <FolderGit2 size={15} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
          <h2 style={sectionTitleStyle}>New workspace</h2>
        </div>
        <p style={hintStyle}>
          A workspace is a folder on this device bound to the active org. Pick or create a folder,
          then clone repos into it.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <input
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="Absolute folder path, e.g. C:\\Users\\you\\code\\acme"
            spellCheck={false}
            style={inputStyle}
          />
          <button
            type="button"
            disabled={busy || !rootPath.trim() || !orgId}
            onClick={() => void createWorkspace()}
            style={primaryButtonStyle(busy || !rootPath.trim() || !orgId)}
          >
            <Plus size={14} aria-hidden="true" />
            Create
          </button>
        </div>
        {!orgId ? (
          <p style={{ ...hintStyle, color: "var(--warning)" }}>
            Sign in and select an org before creating a workspace.
          </p>
        ) : null}
      </section>

      {workspaces.length === 0 ? (
        <EmptyState />
      ) : (
        workspaces.map((ws) => (
          <section key={ws.id} style={cardStyle}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}
            >
              <h2 style={sectionTitleStyle}>{ws.rootPath}</h2>
              <span style={{ ...hintStyle, marginLeft: "auto" }}>{ws.repos.length} repos</span>
            </div>
            <p style={{ ...hintStyle, marginTop: 0 }}>org {ws.orgId}</p>

            {ws.repos.length === 0 ? (
              <p style={hintStyle}>No repos cloned here yet.</p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "0.5rem 0 0",
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.375rem",
                }}
              >
                {ws.repos.map((repo) => (
                  <RepoRow key={repo.fullName} repo={repo} />
                ))}
              </ul>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.625rem" }}>
              <input
                value={cloneTarget?.workspaceId === ws.id ? cloneTarget.fullName : cloneFullName}
                onChange={(e) => setCloneFullName(e.target.value)}
                placeholder="owner/repo to clone"
                spellCheck={false}
                disabled={busy && cloneTarget?.workspaceId === ws.id}
                style={inputStyle}
              />
              <button
                type="button"
                disabled={busy || !cloneFullName.trim()}
                onClick={() => void cloneRepo(ws.id)}
                style={secondaryButtonStyle(busy || !cloneFullName.trim())}
              >
                {busy && cloneTarget?.workspaceId === ws.id ? (
                  <Loader2 size={14} aria-hidden="true" className="animate-spin" />
                ) : (
                  <GitFork size={14} aria-hidden="true" />
                )}
                Clone
              </button>
            </div>

            {cloneTarget?.workspaceId === ws.id && cloneLines.length > 0 ? (
              <pre ref={cloneScrollRef} style={progressLogStyle}>
                {cloneLines.join("\n")}
              </pre>
            ) : null}
          </section>
        ))
      )}
    </div>
  );
}

function RepoRow({ repo }: { repo: RepoEntry }) {
  const stale = repo.indexedSha !== null;
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.4375rem 0.5rem",
        borderRadius: "6px",
        border: "1px solid var(--border)",
        background: "var(--bg)",
      }}
    >
      <GitBranch size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
      <span style={{ fontWeight: 500, color: "var(--text)" }}>{repo.fullName}</span>
      <span style={{ ...hintStyle, marginLeft: "0.25rem" }}>{repo.defaultBranch}</span>
      {repo.worktrees.length > 0 ? (
        <span style={{ ...hintStyle }}>
          · {repo.worktrees.length} worktree{repo.worktrees.length === 1 ? "" : "s"}
        </span>
      ) : null}
      <span
        style={{ marginLeft: "auto", ...hintStyle }}
        title="Indexed revision in Athena (freshness hint, not a sync state)"
      >
        {stale ? `indexed ${repo.indexedSha?.slice(0, 7)}` : "not indexed"}
      </span>
    </li>
  );
}

function Header({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", marginBottom: "1rem" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text)" }}>
          Workspaces
        </h1>
        <p style={{ ...hintStyle, marginTop: "0.25rem" }}>
          Local checkouts on this device. Not a sync surface.
        </p>
      </div>
      <button type="button" onClick={onRefresh} style={{ ...secondaryButtonStyle(false), marginLeft: "auto" }}>
        <RefreshCw size={14} aria-hidden="true" />
        Refresh
      </button>
    </div>
  );
}

function EmptyState() {
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
      <FolderGit2 size={28} aria-hidden="true" style={{ color: "var(--text-muted)", marginBottom: "0.5rem" }} />
      <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 500, color: "var(--text)" }}>
        Clone or open a repo
      </p>
      <p style={{ ...hintStyle, marginTop: "0.375rem" }}>
        Create a workspace folder above, then clone a repo into it to start working locally.
      </p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      style={{
        marginBottom: "1rem",
        padding: "0.625rem 0.75rem",
        borderRadius: "8px",
        border: "1px solid color-mix(in oklch, var(--danger) 40%, var(--border))",
        background: "color-mix(in oklch, var(--danger) 10%, transparent)",
        color: "var(--danger)",
        fontSize: "0.8125rem",
      }}
    >
      {message}
    </div>
  );
}

function WorkspacesSkeleton() {
  return (
    <div aria-hidden="true" style={{ maxWidth: "52rem", margin: "0 auto" }}>
      <div style={{ ...skeletonBlock, width: "40%", height: "1.25rem", marginBottom: "1rem" }} />
      {[0, 1].map((i) => (
        <div key={i} style={{ ...skeletonBlock, height: "6rem", marginBottom: "0.75rem" }} />
      ))}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  marginBottom: "0.75rem",
  padding: "0.875rem 1rem",
  borderRadius: "10px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.875rem",
  fontWeight: 600,
  color: "var(--text)",
};

const hintStyle: React.CSSProperties = {
  margin: "0.25rem 0 0",
  fontSize: "0.75rem",
  color: "var(--text-muted)",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: "2rem",
  padding: "0 0.5rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  font: "inherit",
  fontSize: "0.8125rem",
};

const skeletonBlock: React.CSSProperties = {
  borderRadius: "8px",
  background: "color-mix(in oklch, var(--text-muted) 12%, transparent)",
};

const progressLogStyle: React.CSSProperties = {
  marginTop: "0.625rem",
  maxHeight: "12rem",
  overflowY: "auto",
  padding: "0.5rem 0.625rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text-muted)",
  fontFamily: "var(--font-jetbrains, ui-monospace, monospace)",
  fontSize: "0.75rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    height: "2rem",
    padding: "0 0.75rem",
    borderRadius: "6px",
    border: "1px solid transparent",
    background: disabled ? "color-mix(in oklch, var(--primary) 40%, var(--surface))" : "var(--primary)",
    color: "var(--primary-fg)",
    font: "inherit",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
    flex: "none",
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
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
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    flex: "none",
  };
}
