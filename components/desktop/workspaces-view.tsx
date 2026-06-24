"use client";

// WorkspacesView: the local workspace + repo surface.
//
// A workspace is a folder on this device bound to the active org, holding one or more cloned repos.
// Most workspaces are created automatically the first time you "Run locally with Claude" on a task
// (named after the task); you can also make one by hand. This view lists them, clones repos into
// them from an auto-found picker of the org's repos (`athena.workspace.listOrgRepos`), lets you
// browse a workspace's files read-only (`athena.workspace.browse`), reveal it in the OS file
// manager, and delete one you no longer need (`athena.workspace.delete`). Local checkouts only -
// never a sync surface.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  File as FileIcon,
  Folder,
  FolderGit2,
  FolderOpen,
  GitBranch,
  GitFork,
  Loader2,
  MessagesSquare,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";
import type { OrgRepo, RepoEntry, Workspace, WorkspaceFileEntry } from "@/lib/desktop/types";
import { useTerminalsStore } from "@/lib/desktop/terminals-store";
import { useDesktopDock } from "@/components/desktop/dock-context";
import { DirectoryField } from "@/components/desktop/directory-field";

interface WorkspacesViewProps {
  /** The active org id (from `athena.auth.status`); new workspaces bind to it. */
  orgId: string | null;
}

export function WorkspacesView({ orgId }: WorkspacesViewProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [orgRepos, setOrgRepos] = useState<OrgRepo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rootPath, setRootPath] = useState("");
  const [cloneTargetId, setCloneTargetId] = useState<string | null>(null);
  const [cloneLines, setCloneLines] = useState<string[]>([]);

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
    // The org repo list backs the clone picker; a failure here is non-fatal (manual entry still works).
    try {
      setOrgRepos(await athena.workspace.listOrgRepos());
    } catch {
      setOrgRepos([]);
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
    async (workspaceId: string, fullName: string) => {
      const name = fullName.trim();
      if (!name) return;
      setCloneTargetId(workspaceId);
      setCloneLines([]);
      setBusy(true);
      setError(null);
      try {
        const repo: RepoEntry = await athena.workspace.cloneRepo({ workspaceId, fullName: name });
        setCloneLines((prev) => [...prev, `Cloned ${repo.fullName} -> ${repo.localPath}`]);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not clone ${name}`);
      } finally {
        setBusy(false);
        setCloneTargetId(null);
      }
    },
    [refresh],
  );

  const deleteWorkspace = useCallback(
    async (workspaceId: string, deleteFiles: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await athena.workspace.delete(workspaceId, deleteFiles);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete the workspace");
      } finally {
        setBusy(false);
      }
    },
    [refresh],
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
          Running a task locally creates a workspace for it automatically. You can also make one by
          hand here: pick or create a folder, then clone repos into it.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
          <DirectoryField
            value={rootPath}
            onChange={setRootPath}
            placeholder="Choose a folder, or paste an absolute path"
            disabled={busy}
            aria-label="Workspace folder"
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
          <WorkspaceCard
            key={ws.id}
            ws={ws}
            orgRepos={orgRepos}
            busy={busy}
            cloning={cloneTargetId === ws.id}
            cloneLines={cloneTargetId === ws.id ? cloneLines : []}
            onClone={(fullName) => void cloneRepo(ws.id, fullName)}
            onDelete={(deleteFiles) => void deleteWorkspace(ws.id, deleteFiles)}
          />
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-workspace card: header + actions + repo list + clone picker + file browser.
// ---------------------------------------------------------------------------

interface WorkspaceCardProps {
  ws: Workspace;
  orgRepos: OrgRepo[];
  busy: boolean;
  cloning: boolean;
  cloneLines: string[];
  onClone: (fullName: string) => void;
  onDelete: (deleteFiles: boolean) => void;
}

// A per-task workspace lives under `.../athena-workspaces/<org>/<taskDisplayId>`; surface the task id
// as the title so the workspace is obviously the one a task run created (vs a hand-made folder).
function taskIdFromRoot(rootPath: string): string | null {
  const norm = rootPath.replace(/\\/g, "/");
  const marker = "/athena-workspaces/";
  const at = norm.indexOf(marker);
  if (at === -1) return null;
  const rest = norm.slice(at + marker.length).split("/").filter(Boolean);
  // rest = [orgId, taskDisplayId, ...]; the task id is the last meaningful segment.
  return rest.length >= 2 ? (rest[rest.length - 1] ?? null) : null;
}

function WorkspaceCard({ ws, orgRepos, busy, cloning, cloneLines, onClone, onDelete }: WorkspaceCardProps) {
  const [pick, setPick] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  const addTab = useTerminalsStore((s) => s.addTab);
  const { open: openDock } = useDesktopDock();

  const cloneScrollRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const el = cloneScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [cloneLines]);

  const taskId = taskIdFromRoot(ws.rootPath);

  const openClaude = useCallback(() => {
    addTab({
      title: taskId ? `Claude · ${taskId}` : "Claude",
      boundTaskDisplayId: taskId,
      profile: "claude-code",
      cwd: ws.rootPath,
    });
    openDock();
  }, [addTab, openDock, taskId, ws.rootPath]);
  const cloned = new Set(ws.repos.map((r) => r.fullName));
  const available = orgRepos.filter((r) => !cloned.has(r.fullName));
  const listId = `repos-${ws.id}`;

  const submitClone = useCallback(() => {
    const name = pick.trim();
    if (!name) return;
    onClone(name);
    setPick("");
  }, [pick, onClone]);

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.125rem" }}>
        <h2 style={sectionTitleStyle} title={ws.rootPath}>
          {taskId ? `Task ${taskId}` : ws.rootPath}
        </h2>
        <span style={{ ...hintStyle, marginLeft: "auto" }}>
          {ws.repos.length} repo{ws.repos.length === 1 ? "" : "s"}
        </span>
      </div>
      <p style={{ ...hintStyle, marginTop: 0, fontFamily: "var(--font-jetbrains, ui-monospace, monospace)" }}>
        {ws.rootPath}
      </p>

      {/* Actions */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={openClaude} style={primaryButtonStyle(false)}>
          <MessagesSquare size={14} aria-hidden="true" />
          Open Claude
        </button>
        <button
          type="button"
          onClick={() => void athena.app.revealInFolder(ws.rootPath)}
          style={secondaryButtonStyle(false)}
        >
          <FolderOpen size={14} aria-hidden="true" />
          Reveal
        </button>
        <button
          type="button"
          onClick={() => setBrowsing((v) => !v)}
          aria-pressed={browsing}
          style={secondaryButtonStyle(false)}
        >
          <Folder size={14} aria-hidden="true" />
          {browsing ? "Hide files" : "Browse files"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={busy}
          style={{ ...dangerButtonStyle(busy), marginLeft: "auto" }}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete
        </button>
      </div>

      {confirmingDelete ? (
        <DeleteConfirm
          rootPath={ws.rootPath}
          deleteFiles={deleteFiles}
          onToggleFiles={setDeleteFiles}
          onCancel={() => {
            setConfirmingDelete(false);
            setDeleteFiles(false);
          }}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete(deleteFiles);
            setDeleteFiles(false);
          }}
        />
      ) : null}

      {/* Repos */}
      {ws.repos.length === 0 ? (
        <p style={hintStyle}>No repos cloned here yet.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: "0.625rem 0 0",
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

      {/* Clone picker (auto-find from the org's repos, with free-text fallback) */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.625rem" }}>
        <input
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitClone();
          }}
          list={listId}
          placeholder={available.length > 0 ? "Pick a repo to clone, or type owner/repo" : "owner/repo to clone"}
          spellCheck={false}
          disabled={busy && cloning}
          style={inputStyle}
        />
        <datalist id={listId}>
          {available.map((r) => (
            <option key={r.fullName} value={r.fullName}>
              {r.domain ? `${r.domain} · ${r.defaultBranch}` : r.defaultBranch}
            </option>
          ))}
        </datalist>
        <button
          type="button"
          disabled={busy || !pick.trim()}
          onClick={submitClone}
          style={secondaryButtonStyle(busy || !pick.trim())}
        >
          {busy && cloning ? (
            <Loader2 size={14} aria-hidden="true" className="animate-spin" />
          ) : (
            <GitFork size={14} aria-hidden="true" />
          )}
          Clone
        </button>
      </div>
      {available.length === 0 && orgRepos.length > 0 ? (
        <p style={hintStyle}>Every org repo is already cloned here.</p>
      ) : null}

      {cloning && cloneLines.length > 0 ? (
        <pre ref={cloneScrollRef} style={progressLogStyle}>
          {cloneLines.join("\n")}
        </pre>
      ) : null}

      {browsing ? <FileBrowser workspaceId={ws.id} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm (forget vs delete files on disk)
// ---------------------------------------------------------------------------

function DeleteConfirm({
  rootPath,
  deleteFiles,
  onToggleFiles,
  onCancel,
  onConfirm,
}: {
  rootPath: string;
  deleteFiles: boolean;
  onToggleFiles: (v: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alertdialog"
      style={{
        marginTop: "0.625rem",
        padding: "0.75rem",
        borderRadius: "8px",
        border: "1px solid color-mix(in oklch, var(--danger) 40%, var(--border))",
        background: "color-mix(in oklch, var(--danger) 8%, transparent)",
      }}
    >
      <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text)" }}>
        Remove this workspace from Athena?
      </p>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginTop: "0.5rem",
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
        }}
      >
        <input type="checkbox" checked={deleteFiles} onChange={(e) => onToggleFiles(e.target.checked)} />
        Also delete the files on disk
        <span style={{ fontFamily: "var(--font-jetbrains, ui-monospace, monospace)", color: "var(--text-subtle)" }}>
          ({rootPath})
        </span>
      </label>
      <p style={{ ...hintStyle, color: deleteFiles ? "var(--danger)" : "var(--text-subtle)" }}>
        {deleteFiles
          ? "This permanently deletes the folder and any uncommitted local work. This cannot be undone."
          : "Leaves the files on disk; just forgets the workspace. Any committed work is safe in git."}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
        <button type="button" onClick={onConfirm} style={dangerSolidButtonStyle}>
          {deleteFiles ? "Delete files" : "Forget workspace"}
        </button>
        <button type="button" onClick={onCancel} style={secondaryButtonStyle(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Read-only file browser (drill-down, jailed to the workspace in main)
// ---------------------------------------------------------------------------

function FileBrowser({ workspaceId }: { workspaceId: string }) {
  const [relPath, setRelPath] = useState("");
  const [entries, setEntries] = useState<WorkspaceFileEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (path: string) => {
      setError(null);
      try {
        const res = await athena.workspace.browse(workspaceId, path);
        setRelPath(res.relPath);
        setEntries(res.entries);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read this folder");
        setEntries([]);
      }
    },
    [workspaceId],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  const goUp = useCallback(() => {
    const parent = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
    void load(parent);
  }, [relPath, load]);

  return (
    <div
      style={{
        marginTop: "0.625rem",
        borderRadius: "8px",
        border: "1px solid var(--border)",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.4375rem 0.625rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={goUp}
          disabled={relPath === ""}
          aria-label="Up one folder"
          style={{ ...iconButtonStyle, opacity: relPath === "" ? 0.4 : 1 }}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <span
          style={{
            fontFamily: "var(--font-jetbrains, ui-monospace, monospace)",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          /{relPath}
        </span>
      </div>

      {error ? (
        <p style={{ ...hintStyle, margin: 0, padding: "0.625rem" }}>{error}</p>
      ) : entries === null ? (
        <p style={{ ...hintStyle, margin: 0, padding: "0.625rem" }}>Loading…</p>
      ) : entries.length === 0 ? (
        <p style={{ ...hintStyle, margin: 0, padding: "0.625rem" }}>Empty folder.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: "0.25rem", maxHeight: "16rem", overflowY: "auto" }}>
          {entries.map((entry) => (
            <li key={entry.relPath}>
              {entry.kind === "dir" ? (
                <button
                  type="button"
                  onClick={() => void load(entry.relPath)}
                  style={fileRowStyle}
                  title={entry.name}
                >
                  <Folder size={14} aria-hidden="true" style={{ color: "var(--primary)" }} />
                  <span style={fileNameStyle}>{entry.name}</span>
                </button>
              ) : (
                <div style={{ ...fileRowStyle, cursor: "default" }} title={entry.name}>
                  <FileIcon size={14} aria-hidden="true" style={{ color: "var(--text-subtle)" }} />
                  <span style={fileNameStyle}>{entry.name}</span>
                  {typeof entry.size === "number" ? (
                    <span style={{ ...hintStyle, marginLeft: "auto" }}>{formatBytes(entry.size)}</span>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
        No workspaces yet
      </p>
      <p style={{ ...hintStyle, marginTop: "0.375rem" }}>
        Run a task locally with Claude (it creates one automatically), or create a workspace folder
        above and clone a repo into it.
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
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
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

const fileRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  width: "100%",
  padding: "0.3125rem 0.5rem",
  borderRadius: "6px",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  font: "inherit",
  fontSize: "0.8125rem",
  cursor: "pointer",
  textAlign: "left",
};

const fileNameStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const iconButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: "1.5rem",
  width: "1.5rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  cursor: "pointer",
  flex: "none",
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

function dangerButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    height: "2rem",
    padding: "0 0.75rem",
    borderRadius: "6px",
    border: "1px solid color-mix(in oklch, var(--danger) 35%, var(--border))",
    background: "var(--surface)",
    color: "var(--danger)",
    font: "inherit",
    fontSize: "0.8125rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    flex: "none",
  };
}

const dangerSolidButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.375rem",
  height: "2rem",
  padding: "0 0.75rem",
  borderRadius: "6px",
  border: "1px solid transparent",
  background: "var(--danger)",
  color: "var(--danger-fg, white)",
  font: "inherit",
  fontSize: "0.8125rem",
  fontWeight: 500,
  cursor: "pointer",
  flex: "none",
};
