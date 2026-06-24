// Desktop bridge types - mirrors athena-desktop/src/shared/types.ts.
//
// These describe the `window.athena` surface the Electron preload exposes. They are
// duplicated here (rather than imported across repos) so the web build type-checks on its
// own; keep in sync with the desktop repo when the bridge changes. Pure types only.

// --- Auth -------------------------------------------------------------------

export interface AuthStatus {
  hasCodingToken: boolean;
  online: boolean;
  /** The active org id the desktop is bound to (mirrors X-Athena-Org-Id). */
  orgId: string | null;
}

export interface ToolingStatus {
  git: { found: boolean; version?: string };
  gh: { found: boolean; version?: string };
  claude: { found: boolean; version?: string };
  codex: { found: boolean; version?: string };
}

// --- App preferences (device-local) -----------------------------------------

export type CloneMode = "full" | "blobless";

export interface AppPrefs {
  workspaceRoot: string | null;
  defaultShell: string | null;
  terminalFontSize: number;
  terminalScrollback: number;
  persistScrollback: boolean;
  cloneMode: CloneMode;
  concurrentWorktreeCap: number;
  diskBudgetGb: number;
  launchAtLogin: boolean;
  autoApproveTier1: boolean;
}

export type Connectivity = { online: boolean };

// --- Workspace + git + worktrees --------------------------------------------

export interface RepoEntry {
  fullName: string;
  localPath: string;
  defaultBranch: string;
  indexedSha: string | null;
  worktrees: WorktreeMeta[];
}

export interface Workspace {
  id: string;
  orgId: string;
  rootPath: string;
  repos: RepoEntry[];
}

/** A repo that belongs to the active org, for the clone picker (auto-find vs typing owner/repo). */
export interface OrgRepo {
  fullName: string;
  defaultBranch: string;
  domain: string | null;
}

/** One entry in a workspace file listing (read-only browse; paths are workspace-relative POSIX). */
export interface WorkspaceFileEntry {
  name: string;
  relPath: string;
  kind: "dir" | "file";
  size?: number;
}

export interface WorkspaceBrowse {
  relPath: string;
  entries: WorkspaceFileEntry[];
}

export type WorktreeHolder = "executor" | "terminal" | null;

export interface WorktreeMeta {
  taskDisplayId: string;
  branch: string;
  path: string;
  repoFullName: string;
  heldBy: WorktreeHolder;
  claimNonce: string | null;
  claimedStage: string | null;
  inspect: boolean;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  dirty: boolean;
  files: { path: string; index: string; working: string }[];
}

export interface CloneRepoReq {
  workspaceId: string;
  fullName: string;
}

export interface EnsureWorktreeReq {
  workspaceId: string;
  repoFullName: string;
  taskDisplayId: string;
  baseSha?: string;
  stage?: string;
}

export interface EnsureWorktreeRes {
  worktreePath: string;
  branch: string;
}

// --- Terminal ---------------------------------------------------------------

export type ShellKind = "pwsh" | "powershell" | "cmd" | "bash" | "zsh" | "sh";
export type TerminalProfile = "shell" | "claude-code" | "codex";

export interface CreateTerminalReq {
  cwd?: string;
  shell?: ShellKind;
  cols: number;
  rows: number;
  profile?: TerminalProfile;
  boundTaskDisplayId?: string | null;
  /** claude-code profile only: the stage being worked (baked into --append-system-prompt). */
  stage?: string | null;
  /** claude-code profile only: a Claude model alias/id (claude --model). */
  model?: string;
}

export interface TerminalMeta {
  id: string;
  shell: ShellKind;
  cwd: string;
  boundTaskDisplayId: string | null;
}

export interface TerminalData {
  id: string;
  chunk: string;
}

export interface TerminalExit {
  id: string;
  exitCode: number;
  signal?: number;
}

// --- AI gate (approval for the AI's own tools, NEVER the human terminal) -----

export type GateKind = "write_file" | "apply_diff" | "delete_file" | "exec" | "git";
export type GateTier = 1 | 2 | 3;
export type GateDecision = "approve" | "reject";

export interface GatePending {
  id: string;
  kind: GateKind;
  taskDisplayId: string | null;
  workspaceId: string;
  patch?: string;
  argv?: string[];
  cwd?: string;
  tier: GateTier;
  requiresTypedConfirm: boolean;
  confirmSlug?: string;
  summary: string;
}

export interface GateResolve {
  id: string;
  decision: GateDecision;
  note?: string;
  typedConfirm?: string;
}

export interface GateState {
  unlocked: boolean;
}

// --- Executor (headless local executor protocol) ----------------------------

export interface StartExecutorReq {
  taskId: string;
  taskDisplayId: string;
  stage: string;
  /** Optional Claude model alias/id (claude --model); omit for the CLI's configured default. */
  model?: string;
}

export interface ExecutorRun {
  id: string;
  taskId: string;
  taskDisplayId: string;
  stage: string;
  status: "claiming" | "working" | "submitting" | "done" | "stopped" | "error" | "reassigned";
  message: string;
  claimNonce: string | null;
}

export interface ExecutorEvent {
  run: ExecutorRun;
}

/** One line of a run's live activity feed (renderer-only; never sent to the backend). */
export interface ExecutorLogLine {
  runId: string;
  taskDisplayId: string;
  kind: "system" | "agent" | "tool" | "result" | "stderr";
  text: string;
}

// --- Audit log --------------------------------------------------------------

export interface AuditRow {
  ts: string;
  workspaceId: string;
  orgId: string;
  tool: string;
  argsPathsOnly: string[];
  decision: GateDecision | "auto";
  diffSha?: string;
  exitCode?: number;
  durationMs?: number;
  agentRuntime: string;
  taskId?: string;
  stage?: string;
  rowHash: string;
  prevHash: string;
}

// --- Notifications / tray ---------------------------------------------------

export type NotifyKind = "gate_pending" | "task_status" | "clarification" | "budget";

export interface NotifyEvent {
  kind: NotifyKind;
  taskId: string;
  taskDisplayId: string;
  title: string;
  body: string;
  stage?: string;
}

export interface DeepLink {
  url: string;
}

/** The OAuth { code, state } returned via athena://auth/callback from the external browser. */
export interface OAuthCallback {
  code: string;
  state: string | null;
}

/** A native application-menu / accelerator command pushed from main to the renderer. */
export type MenuCommand =
  | "command-palette"
  | "toggle-terminal"
  | "emergency-stop"
  | "new-task"
  | "settings";

/** The host OS, exposed synchronously so desktop chrome can branch without an async round-trip. */
export type DesktopPlatform = "mac" | "win" | "linux";

export type Unsubscribe = () => void;

// --- The full window.athena bridge surface ----------------------------------

export interface AthenaBridge {
  /** The host OS, available synchronously (no await) for chrome that must branch on first paint. */
  platform: DesktopPlatform;
  auth: {
    setSessionToken(jwt: string): Promise<void>;
    mintCodingToken(name: string): Promise<{ ok: boolean }>;
    clearCodingToken(): Promise<void>;
    status(): Promise<AuthStatus>;
    onOAuthCallback(cb: (c: OAuthCallback) => void): Unsubscribe;
  };
  app: {
    getPrefs(): Promise<AppPrefs>;
    setPrefs(patch: Partial<AppPrefs>): Promise<AppPrefs>;
    openExternal(url: string): Promise<void>;
    revealInFolder(path: string): Promise<void>;
    pickDirectory(defaultPath?: string): Promise<string | null>;
    detectTooling(): Promise<ToolingStatus>;
    orgSwitched(orgId: string): Promise<void>;
    onDeepLink(cb: (d: DeepLink) => void): Unsubscribe;
    onConnectivity(cb: (c: Connectivity) => void): Unsubscribe;
    onMenuCommand(cb: (c: MenuCommand) => void): Unsubscribe;
  };
  workspace: {
    list(): Promise<Workspace[]>;
    create(rootPath: string, orgId: string): Promise<Workspace>;
    cloneRepo(req: CloneRepoReq): Promise<RepoEntry>;
    repoStatus(workspaceId: string, repoFullName: string): Promise<GitStatus>;
    delete(workspaceId: string, deleteFiles?: boolean): Promise<{ ok: boolean }>;
    listOrgRepos(): Promise<OrgRepo[]>;
    browse(workspaceId: string, relPath?: string): Promise<WorkspaceBrowse>;
    ensureTask(taskDisplayId: string): Promise<Workspace>;
    focus(taskDisplayId: string | null): Promise<void>;
    onCloneLine(cb: (line: string) => void): Unsubscribe;
    onWatchEvent(
      cb: (e: { workspaceId: string; repoFullName: string; aheadOfIndexed: boolean }) => void,
    ): Unsubscribe;
  };
  worktree: {
    ensure(req: EnsureWorktreeReq): Promise<EnsureWorktreeRes>;
    list(workspaceId: string): Promise<WorktreeMeta[]>;
    prune(worktreePath: string, typedConfirm?: string): Promise<{ ok: boolean }>;
    bindTerminal(
      terminalId: string,
      taskDisplayId: string,
    ): Promise<{ worktreePath: string; inspect: boolean }>;
  };
  git: {
    status(workspaceId: string, repoFullName: string): Promise<GitStatus>;
    diff(workspaceId: string, repoFullName: string, base?: string): Promise<string>;
    branch(workspaceId: string, repoFullName: string): Promise<string[]>;
    commit(workspaceId: string, repoFullName: string, message: string): Promise<{ ok: boolean }>;
    push(workspaceId: string, repoFullName: string, branch: string): Promise<{ ok: boolean }>;
    onPushLine(cb: (line: string) => void): Unsubscribe;
  };
  terminal: {
    create(req: CreateTerminalReq): Promise<{ id: string }>;
    write(id: string, data: string): Promise<void>;
    resize(id: string, cols: number, rows: number): Promise<void>;
    kill(id: string): Promise<void>;
    list(): Promise<TerminalMeta[]>;
    onData(cb: (d: TerminalData) => void): Unsubscribe;
    onExit(cb: (e: TerminalExit) => void): Unsubscribe;
  };
  gate: {
    resolve(r: GateResolve): Promise<void>;
    unlock(): Promise<void>;
    lock(): Promise<void>;
    status(): Promise<GateState>;
    onPending(cb: (g: GatePending) => void): Unsubscribe;
  };
  executor: {
    start(req: StartExecutorReq): Promise<{ id: string }>;
    stop(id: string): Promise<void>;
    list(): Promise<ExecutorRun[]>;
    onEvent(cb: (e: ExecutorEvent) => void): Unsubscribe;
    onLog(cb: (l: ExecutorLogLine) => void): Unsubscribe;
    logs(taskDisplayId: string): Promise<ExecutorLogLine[]>;
  };
  audit: {
    list(orgId: string, limit?: number): Promise<AuditRow[]>;
  };
  notify: {
    onEvent(cb: (e: NotifyEvent) => void): Unsubscribe;
  };
}
