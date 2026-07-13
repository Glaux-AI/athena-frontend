"use client";

/**
 * CreateArtifactDialog - the "New artifact" flow. Doc (markdown body) and link
 * (url) go through the JSON create; a file/image goes through the multipart
 * upload. Scope is Personal or Org in the quick create (domain scope needs a
 * domain picker - a Phase-2 addition).
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { ApiError, api, type LibraryArtifactDetail } from "@/lib/api/client";

type Mode = "doc" | "link" | "upload";
type Scope = "personal" | "org";

const MODES: { key: Mode; label: string }[] = [
  { key: "doc", label: "Document" },
  { key: "link", label: "Link" },
  { key: "upload", label: "Upload" },
];

export function CreateArtifactDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (a: LibraryArtifactDetail) => void;
}) {
  const [mode, setMode] = useState<Mode>("doc");
  const [scope, setScope] = useState<Scope>("personal");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMode("doc");
    setScope("personal");
    setTitle("");
    setBody("");
    setUrl("");
    setFile(null);
    setError(null);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await create(mode, { title, body, url, file, scope });
      onCreated(created);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the artifact.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    title.trim().length > 0 &&
    ((mode === "doc" && body.trim().length > 0) ||
      (mode === "link" && url.trim().length > 0) ||
      (mode === "upload" && file !== null));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New artifact"
      description="Add a document, a link, or a file to the Library."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || busy} loading={busy}>
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented options={MODES} value={mode} onChange={setMode} />

        <Field label="Title">
          <input
            className={INPUT}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === "link" ? "What is this link?" : "Give it a title"}
          />
        </Field>

        {mode === "doc" && (
          <Field label="Body (Markdown)">
            <textarea
              className={`${INPUT} min-h-[16rem] resize-y font-mono`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="# Runbook…"
            />
          </Field>
        )}
        {mode === "link" && (
          <Field label="URL">
            <input
              className={INPUT}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
            />
          </Field>
        )}
        {mode === "upload" && (
          <Field label="File">
            <input
              type="file"
              className="text-sm text-[var(--text-muted)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--surface-3)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--text)]"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        )}

        <Field label="Visibility">
          <div className="flex gap-2">
            <ScopeChip active={scope === "personal"} onClick={() => setScope("personal")}>
              Only me
            </ScopeChip>
            <ScopeChip active={scope === "org"} onClick={() => setScope("org")}>
              Whole org
            </ScopeChip>
          </div>
        </Field>

        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      </div>
    </Modal>
  );
}

async function create(
  mode: Mode,
  input: { title: string; body: string; url: string; file: File | null; scope: Scope },
): Promise<LibraryArtifactDetail> {
  if (mode === "upload" && input.file) {
    return api.artifacts.upload({ file: input.file, title: input.title, scope: input.scope });
  }
  if (mode === "link") {
    return api.artifacts.create({ format: "link", title: input.title, url: input.url, scope: input.scope });
  }
  return api.artifacts.create({ format: "doc", title: input.title, body: input.body, scope: input.scope });
}

const INPUT =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--border-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={
            value === o.key
              ? "rounded-md bg-[var(--surface-3)] px-3 py-1.5 text-sm text-[var(--text)]"
              : "rounded-md px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full border border-[var(--border-accent)] bg-[var(--primary-soft)] px-3 py-1 text-sm text-[var(--primary-ink)]"
          : "rounded-full border border-[var(--border)] px-3 py-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
      }
    >
      {children}
    </button>
  );
}
