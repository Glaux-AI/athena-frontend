"use client";

/**
 * <AgentMemoryDialog/> - browse + edit what a custom agent remembers.
 *
 * The same folder-style files the agent reads/writes at run time: the agent's
 * shared store (one for everyone using it) and the caller's personal store.
 * Click a file to read/edit it inline; add or delete files freely - the agent
 * sees the edits on its next turn. New files land in the store the agent
 * actually uses (shared when `memory_shared`, else personal).
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { NotebookPen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing } from "@/components/ui/focus";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatDateTime } from "@/lib/utils/format";
import {
  api,
  ApiError,
  type Agent,
  type AgentMemory,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

export function AgentMemoryDialog({
  agent,
  open,
  onClose,
}: {
  agent: Agent;
  open: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<AgentMemory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [newContent, setNewContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AgentMemory | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    try {
      setFiles(await api.agents.memories.list(agent.id));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load memory.");
    }
  }, [agent.id]);

  useEffect(() => {
    if (!open) return;
    setFiles(null);
    setOpenId(null);
    setCreating(false);
    setNewPath("");
    setNewContent("");
    void reload();
  }, [open, reload]);

  const openFile = async (f: AgentMemory) => {
    if (openId === f.id) {
      setOpenId(null);
      return;
    }
    setOpenId(f.id);
    setContentLoading(true);
    try {
      const detail = await api.agents.memories.get(agent.id, f.id);
      setContent(detail.content);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to open memory.");
      setOpenId(null);
    } finally {
      setContentLoading(false);
    }
  };

  const saveOpen = async (f: AgentMemory) => {
    setSaving(true);
    try {
      await api.agents.memories.upsert(agent.id, {
        path: f.path,
        content,
        shared: f.shared,
      });
      toast.success("Memory saved");
      setOpenId(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save memory.");
    } finally {
      setSaving(false);
    }
  };

  const createNew = async () => {
    if (!newPath.trim()) return;
    setSaving(true);
    try {
      // New files land in the store the agent actually uses.
      await api.agents.memories.upsert(agent.id, {
        path: newPath.trim(),
        content: newContent,
        shared: agent.memory_shared,
      });
      toast.success("Memory added");
      setCreating(false);
      setNewPath("");
      setNewContent("");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to add memory.");
    } finally {
      setSaving(false);
    }
  };

  const removeFile = async (f: AgentMemory) => {
    setDeleting(true);
    try {
      await api.agents.memories.delete(agent.id, f.id);
      if (openId === f.id) setOpenId(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete memory.");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const shared = (files ?? []).filter((f) => f.shared);
  const personal = (files ?? []).filter((f) => !f.shared);
  const bothKinds = shared.length > 0 && personal.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Memory · ${agent.name}`}
      description={
        agent.memory_shared
          ? "Shared by everyone who uses this agent."
          : "What this agent remembers for you."
      }
    >
      <Stack gap="4">
        {error && (
          <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
            {error}
          </div>
        )}

        {files == null && !error ? (
          <Stack gap="2" aria-busy="true" aria-label="Loading memory">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </Stack>
        ) : files != null && files.length === 0 && !creating ? (
          <EmptyState
            icon={<NotebookPen className="size-6" />}
            title="Nothing remembered yet"
            description="The agent saves useful things here as you use it. You can add one yourself too."
            action={
              <Button size="sm" onClick={() => setCreating(true)} data-testid="memory-add-empty">
                <Plus className="size-3.5" />Add memory
              </Button>
            }
          />
        ) : files != null ? (
          <Stack gap="4">
            {[
              { label: "Shared", rows: shared },
              { label: "Yours", rows: personal },
            ]
              .filter((s) => s.rows.length > 0)
              .map((section) => (
                <Stack gap="1.5" key={section.label}>
                  {bothKinds && <Eyebrow>{section.label}</Eyebrow>}
                  {section.rows.map((f) => (
                    <MemoryRow
                      key={f.id}
                      file={f}
                      open={openId === f.id}
                      content={content}
                      contentLoading={contentLoading}
                      saving={saving}
                      onToggle={() => void openFile(f)}
                      onContentChange={setContent}
                      onSave={() => void saveOpen(f)}
                      onDelete={() => setDeleteTarget(f)}
                    />
                  ))}
                </Stack>
              ))}
          </Stack>
        ) : null}

        {creating ? (
          <Stack gap="2" className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="Path, e.g. customers/acme.md"
              className="input font-mono text-xs"
              data-testid="memory-new-path"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              maxLength={12000}
              placeholder="What should the agent remember?"
              className="input min-h-[100px] text-sm leading-relaxed"
              data-testid="memory-new-content"
            />
            <Cluster justify="end" gap="2">
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => setCreating(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                loading={saving}
                disabled={saving || !newPath.trim()}
                onClick={() => void createNew()}
                data-testid="memory-new-save"
              >
                Save
              </Button>
            </Cluster>
          </Stack>
        ) : (
          files != null &&
          files.length > 0 && (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreating(true)}
                data-testid="memory-add"
              >
                <Plus className="size-3.5" />Add memory
              </Button>
            </div>
          )
        )}
      </Stack>

      <ConfirmDialog
        open={deleteTarget != null}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) void removeFile(deleteTarget);
        }}
        tone="danger"
        title={`Delete "${deleteTarget?.path ?? ""}"?`}
        description="The agent forgets it permanently."
        confirmLabel="Delete"
        loading={deleting}
      />
    </Modal>
  );
}

function MemoryRow({
  file,
  open,
  content,
  contentLoading,
  saving,
  onToggle,
  onContentChange,
  onSave,
  onDelete,
}: {
  file: AgentMemory;
  open: boolean;
  content: string;
  contentLoading: boolean;
  saving: boolean;
  onToggle: () => void;
  onContentChange: (v: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const slash = file.path.lastIndexOf("/");
  const folder = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? file.path.slice(slash + 1) : file.path;

  return (
    <div className="rounded-md border border-[var(--border)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`memory-row-${file.path}`}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]",
          focusRing,
        )}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {folder && <span className="text-[var(--text-subtle)]">{folder}</span>}
          <span className="text-[var(--text)]">{name}</span>
        </span>
        <span className="shrink-0 text-micro text-[var(--text-subtle)]">
          {formatDateTime(file.updated_at)}
        </span>
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-2.5">
          {contentLoading ? (
            <Skeleton className="h-24 w-full rounded-md" />
          ) : (
            <Stack gap="2">
              <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                maxLength={12000}
                className="input min-h-[120px] text-sm leading-relaxed"
                aria-label={`Content of ${file.path}`}
                data-testid="memory-content"
              />
              <Cluster justify="between" align="center">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={onDelete}
                  className="text-[var(--danger-ink)]"
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  loading={saving}
                  disabled={saving}
                  onClick={onSave}
                  data-testid="memory-save"
                >
                  Save
                </Button>
              </Cluster>
            </Stack>
          )}
        </div>
      )}
    </div>
  );
}
