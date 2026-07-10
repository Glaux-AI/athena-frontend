"use client";

/**
 * Settings → Labels - the org's categorization vocabulary.
 *
 * Labels are a curated cross-cutting axis (a join table, so a rename cascades
 * across every task). A key may carry one `:` group prefix (`customer:acme`,
 * `sev:1`); `sev:1`/`sev:2` additionally override priority in the My-Work /
 * backlog sort. Coining / renaming needs `labels:manage`; attaching an existing
 * label to a task only needs task editing.
 */

import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { focusRing, inputFocus } from "@/components/ui/focus";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Cluster, Stack } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { usePermissions } from "@/lib/session/use-permissions";
import { labelColorClass, splitLabelKey } from "@/lib/work/label-meta";
import { api, ApiError, type Label, type LabelColor } from "@/lib/api/client";

const COLORS: LabelColor[] = [
  "slate", "red", "orange", "amber", "mint", "violet", "cyan", "indigo", "rose",
];

/** Label color -> the Pill tone whose -soft/-ink pair label-meta maps it to. */
const COLOR_TONE: Record<string, PillTone> = {
  slate: "neutral",
  red: "danger",
  rose: "danger",
  orange: "warning",
  amber: "warning",
  mint: "success",
  violet: "primary",
  cyan: "info",
  indigo: "info",
};

const INPUT_CLASS = `w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-[border-color,box-shadow] duration-150 ${inputFocus}`;

export default function LabelsPage() {
  const { can } = usePermissions();
  const canManage = can("labels:manage");
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openNew, setOpenNew] = useState(false);
  // Deleting a label detaches it from every task - it confirms like the task
  // delete does, instead of firing on a bare click.
  const [confirmDelete, setConfirmDelete] = useState<Label | null>(null);

  const load = useCallback(async () => {
    try {
      setLabels(await api.labels.list(true));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load labels.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const archive = async (l: Label, archived: boolean) => {
    try {
      await api.labels.patch(l.id, { archived });
      toast.success(archived ? `Archived "${l.key}".` : `Restored "${l.key}".`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the label.");
    }
  };

  const remove = async (l: Label) => {
    try {
      await api.labels.remove(l.id);
      toast.success(`Deleted "${l.key}".`);
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete the label.");
    }
  };

  const active = labels.filter((l) => !l.archived);
  const archived = labels.filter((l) => l.archived);

  return (
    <Stack gap="6">
      <SettingsPageHeader
        title="Labels"
        subtitle="A shared vocabulary for categorizing work across teams and domains. Use a 'group:value' key (like customer:acme or sev:1) to organize at scale."
        action={
          canManage && labels.length > 0 ? (
            <Button size="sm" onClick={() => setOpenNew(true)}>
              <Plus className="mr-1.5 size-4" aria-hidden />
              New label
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <LabelsSkeleton />
      ) : error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]"
        >
          {error}
        </p>
      ) : labels.length === 0 ? (
        <EmptyState
          icon={<Tag className="size-5" />}
          title="No labels yet"
          description="Create labels to slice the board and analytics by anything that matters - severity, customer, OKR, theme."
          action={
            canManage ? (
              <Button onClick={() => setOpenNew(true)}>
                <Plus className="mr-1.5 size-4" aria-hidden />
                Create a label
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stack gap="4">
          <LabelGroup
            title="Active"
            labels={active}
            canManage={canManage}
            onArchive={(l) => void archive(l, true)}
            onDelete={setConfirmDelete}
            onChanged={load}
          />
          {archived.length > 0 && (
            <LabelGroup
              title="Archived"
              labels={archived}
              canManage={canManage}
              onRestore={(l) => void archive(l, false)}
              onDelete={setConfirmDelete}
              onChanged={load}
            />
          )}
        </Stack>
      )}

      <LabelModal
        open={openNew}
        onOpenChange={setOpenNew}
        onSaved={async () => {
          setOpenNew(false);
          await load();
        }}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          const l = confirmDelete;
          setConfirmDelete(null);
          if (l) void remove(l);
        }}
        title="Delete this label?"
        description="This removes it from every task that carries it. To retire it without losing history, archive it instead."
        tone="danger"
        confirmLabel="Delete"
        body={
          confirmDelete ? (
            <p className="text-sm text-[var(--text)]">
              <LabelPill label={confirmDelete} />
            </p>
          ) : null
        }
      />
    </Stack>
  );
}

function LabelGroup({
  title,
  labels,
  canManage,
  onArchive,
  onRestore,
  onDelete,
  onChanged,
}: {
  title: string;
  labels: Label[];
  canManage: boolean;
  onArchive?: (l: Label) => void;
  onRestore?: (l: Label) => void;
  onDelete: (l: Label) => void | Promise<void>;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Label | null>(null);
  if (labels.length === 0) return null;
  return (
    <Stack gap="2">
      <Eyebrow>
        {title} · {labels.length}
      </Eyebrow>
      <div className="flex flex-wrap gap-2">
        {labels.map((l) => (
          <div
            key={l.id}
            className="group inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 pl-2 pr-1"
          >
            <LabelPill label={l} />
            {canManage && (
              // Management chrome stays quiet until the chip is hovered or an
              // action inside it holds focus (keyboard path).
              <span className="flex items-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setEditing(l)}
                  className={`rounded px-1.5 py-0.5 text-micro text-[var(--text-muted)] transition-colors hover:text-[var(--text)] ${focusRing}`}
                >
                  Edit
                </button>
                {onArchive && (
                  <IconBtn label="Archive" onClick={() => onArchive(l)}>
                    <Archive className="size-3.5" aria-hidden />
                  </IconBtn>
                )}
                {onRestore && (
                  <IconBtn label="Restore" onClick={() => onRestore(l)}>
                    <ArchiveRestore className="size-3.5" aria-hidden />
                  </IconBtn>
                )}
                <IconBtn label="Delete" danger onClick={() => void onDelete(l)}>
                  <Trash2 className="size-3.5" aria-hidden />
                </IconBtn>
              </span>
            )}
          </div>
        ))}
      </div>
      <LabelModal
        open={editing !== null}
        label={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
    </Stack>
  );
}

function LabelPill({ label }: { label: Label }) {
  const { prefix, value } = splitLabelKey(label.key);
  return (
    <Pill tone={COLOR_TONE[label.color] ?? "neutral"} dot title={label.key}>
      {prefix && <span className="mr-0.5 opacity-60">{prefix}:</span>}
      {value}
    </Pill>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`${
        danger
          ? "rounded p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--danger-soft)] hover:text-[var(--danger-ink)]"
          : "rounded p-1 text-[var(--text-subtle)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      } ${focusRing}`}
    >
      {children}
    </button>
  );
}

function LabelModal({
  open,
  label,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  label?: Label | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const editing = Boolean(label);
  const [key, setKey] = useState("");
  const [color, setColor] = useState<string>("slate");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setKey(label?.key ?? "");
      setColor(label?.color ?? "slate");
      setDescription(label?.description ?? "");
    }
  }, [open, label]);

  const save = async () => {
    if (!key.trim()) return;
    setBusy(true);
    try {
      if (label) {
        await api.labels.patch(label.id, {
          key: key.trim(),
          color,
          description: description.trim(),
        });
      } else {
        await api.labels.create({
          key: key.trim(),
          color,
          ...(description.trim() ? { description: description.trim() } : {}),
        });
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the label.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={editing ? "Edit label" : "New label"}
      description="A lowercase key, optionally with one ':' group prefix (sev:1, customer:acme)."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} loading={busy} disabled={!key.trim()}>
            {editing ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <Stack gap="3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Key</span>
          <input
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="tech-debt, customer:acme, sev:1"
            className={INPUT_CLASS}
          />
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Color</span>
          <Cluster gap="1.5" className="flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${labelColorClass(c)} ${
                  color === c ? "ring-2 ring-[var(--ring)]" : ""
                } ${focusRing}`}
              >
                {c}
              </button>
            ))}
          </Cluster>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            Description <span className="text-[var(--text-subtle)]">(optional)</span>
          </span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When to use this label"
            className={INPUT_CLASS}
          />
        </label>
      </Stack>
    </Modal>
  );
}

function LabelsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="skeleton h-8 w-24 rounded-lg" />
      ))}
    </div>
  );
}
