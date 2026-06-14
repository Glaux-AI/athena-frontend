"use client";

/**
 * UploadResourceDialog - the Sources tab "Upload resource" surface.
 *
 * Three modes via a segmented control:
 *   - **File** - PDF / image / .docx / text. Multipart upload; the
 *     backend sniffs + extracts text.
 *   - **Link** - a public URL or a connected-integration page (Notion,
 *     Confluence, ...). The backend fetches + extracts what it can.
 *   - **Note** - pasted markdown, indexed verbatim.
 *
 * Every kind shares an optional Title + Tags row. On submit the resource
 * is indexed synchronously into the domain knowledge base (so an agent's
 * `search_knowledge` finds it) and the parent refreshes its list.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Link2, Loader2, StickyNote, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { api, ApiError, type UploadResourceInput } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Cluster, Stack } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

type Mode = "file" | "link" | "note";

const MODES: { key: Mode; label: string; icon: typeof FileText }[] = [
  { key: "file", label: "File", icon: FileText },
  { key: "link", label: "Link", icon: Link2 },
  { key: "note", label: "Note", icon: StickyNote },
];

const FILE_ACCEPT = ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.webp";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domainId: string;
  /** Called after a successful upload so the parent can refresh resources. */
  onUploaded: () => Promise<void> | void;
}

export function UploadResourceDialog({ open, onOpenChange, domainId, onUploaded }: Props) {
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* Reset everything when the dialog closes so reopening starts clean. */
  useEffect(() => {
    if (!open) {
      setMode("file");
      setFile(null);
      setUrl("");
      setNote("");
      setTitle("");
      setTags("");
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (mode === "file") return file !== null;
    if (mode === "link") return url.trim().length > 0;
    return note.trim().length > 0;
  }, [submitting, mode, file, url, note]);

  const submit = useCallback(async () => {
    const parsedTags = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const input: UploadResourceInput = {
      kind: mode,
      ...(mode === "file" && file ? { file } : {}),
      ...(mode === "link" ? { url: url.trim() } : {}),
      ...(mode === "note" ? { note } : {}),
      ...(title.trim() ? { title: title.trim() } : {}),
      ...(parsedTags.length ? { tags: parsedTags } : {}),
    };
    setSubmitting(true);
    try {
      const res = await api.domains.uploadResource(domainId, input);
      toast.success(
        res.status === "indexed"
          ? `Added "${res.title}" - indexed into the knowledge base.`
          : `Added "${res.title}".`,
      );
      await onUploaded();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Upload failed - try again.");
    } finally {
      setSubmitting(false);
    }
  }, [tags, mode, file, url, note, title, domainId, onUploaded, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in data-[state=closed]:animate-out data-[state=closed]:fade-out" />
        <Dialog.Content
          className="glass fixed left-1/2 top-1/2 z-50 flex max-h-[min(720px,calc(100vh-2rem))] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl shadow-[var(--shadow-3)] focus:outline-none data-[state=open]:motion-safe:animate-in data-[state=open]:motion-safe:fade-in data-[state=open]:motion-safe:zoom-in-95 data-[state=closed]:motion-safe:animate-out data-[state=closed]:motion-safe:fade-out"
          aria-describedby="upload-resource-desc"
        >
          <Stack gap="3" className="rounded-t-xl border-b border-[var(--border)] bg-gradient-to-b from-[var(--surface-2)] to-transparent p-5 shadow-[var(--inner-highlight)]">
            <Cluster justify="between" align="center">
              <Dialog.Title className="text-lg font-semibold">Add a resource</Dialog.Title>
              <Dialog.Close className="text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Close">
                <X className="size-4" />
              </Dialog.Close>
            </Cluster>
            <Dialog.Description id="upload-resource-desc" className="text-sm text-[var(--text-muted)]">
              Drop a file, paste a link, or write a note. Athena indexes it into this
              domain&apos;s knowledge base so agents can find and cite it.
            </Dialog.Description>
            <ModeTabs mode={mode} onChange={setMode} disabled={submitting} />
          </Stack>

          <div className="min-h-[180px] flex-1 overflow-y-auto p-5">
            <Stack gap="4">
              {mode === "file" && <FilePicker file={file} onPick={setFile} disabled={submitting} />}
              {mode === "link" && <LinkInput value={url} onChange={setUrl} disabled={submitting} />}
              {mode === "note" && <NoteInput value={note} onChange={setNote} disabled={submitting} />}
              <MetaFields
                title={title}
                tags={tags}
                onTitle={setTitle}
                onTags={setTags}
                disabled={submitting}
              />
            </Stack>
          </div>

          <Cluster justify="end" align="center" gap="2" className="border-t border-[var(--border)] p-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit}>
              {submitting ? <Loader2 className="size-3 animate-spin" aria-hidden /> : <Upload className="size-3" aria-hidden />}
              {submitting ? "Indexing…" : "Add resource"}
            </Button>
          </Cluster>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ModeTabs({ mode, onChange, disabled }: { mode: Mode; onChange: (m: Mode) => void; disabled: boolean }) {
  return (
    <div role="tablist" aria-label="Resource type">
      <Cluster gap="2" align="center">
        {MODES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === mode}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-[color,background-color,border-color] duration-150 ease-out disabled:opacity-50",
              key === mode
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-[var(--shadow-1)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </Cluster>
    </div>
  );
}

function FilePicker({ file, onPick, disabled }: { file: File | null; onPick: (f: File | null) => void; disabled: boolean }) {
  return (
    <Stack gap="1">
      <label htmlFor="resource-file" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        File
      </label>
      <label
        htmlFor="resource-file"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-2)] px-4 py-6 text-center transition-colors hover:border-[var(--border-accent)]",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="size-5 text-[var(--text-muted)]" aria-hidden />
        {file ? (
          <span className="text-sm font-medium text-[var(--text)]">{file.name}</span>
        ) : (
          <span className="text-sm text-[var(--text-muted)]">Click to choose a PDF, image, .docx, or text file</span>
        )}
        <span className="text-[10px] text-[var(--text-subtle)]">Up to 20 MB</span>
        <input
          id="resource-file"
          type="file"
          accept={FILE_ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </Stack>
  );
}

function LinkInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <Stack gap="1">
      <label htmlFor="resource-url" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        URL
      </label>
      <input
        id="resource-url"
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="https://… (public page, or a connected Notion / Confluence link)"
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
        autoComplete="off"
        spellCheck={false}
      />
    </Stack>
  );
}

function NoteInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <Stack gap="1">
      <label htmlFor="resource-note" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        Note (markdown)
      </label>
      <textarea
        id="resource-note"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={6}
        placeholder="Paste or write the knowledge you want this domain to remember…"
        className="resize-y rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      />
    </Stack>
  );
}

function MetaFields({
  title,
  tags,
  onTitle,
  onTags,
  disabled,
}: {
  title: string;
  tags: string;
  onTitle: (v: string) => void;
  onTags: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Stack gap="3">
      <Stack gap="1">
        <label htmlFor="resource-title" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Title <span className="font-normal normal-case text-[var(--text-subtle)]">(optional)</span>
        </label>
        <input
          id="resource-title"
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          disabled={disabled}
          placeholder="A short, recognizable name"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          autoComplete="off"
        />
      </Stack>
      <Stack gap="1">
        <label htmlFor="resource-tags" className="text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
          Tags <span className="font-normal normal-case text-[var(--text-subtle)]">(comma-separated, optional)</span>
        </label>
        <input
          id="resource-tags"
          type="text"
          value={tags}
          onChange={(e) => onTags(e.target.value)}
          disabled={disabled}
          placeholder="onboarding, payments, runbook"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          autoComplete="off"
        />
      </Stack>
    </Stack>
  );
}
