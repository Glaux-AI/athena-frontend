"use client";

/**
 * <SkillImportModal/> - import a competency written for another agent.
 *
 * Two steps in one modal: (1) paste text or choose a file, Preview ->
 * POST /v1/skills/import (commit:false) parses + auto-detects the format;
 * (2) review the parsed draft (name/description editable, body read-only,
 * warnings surfaced), Save -> create it as a draft and open its editor so the
 * user can assign phases and refine. Supports Claude Code SKILL.md, Cursor
 * .mdc / .cursorrules, Windsurf .windsurfrules, and generic markdown.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Sparkles, Upload } from "lucide-react";

import { Modal } from "@/components/ui/overlay";
import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { api, ApiError, type ImportSkillPreview } from "@/lib/api/client";

const FORMAT_LABELS: Record<string, string> = {
  claude_code: "Claude Code (SKILL.md)",
  cursor_mdc: "Cursor rule (.mdc)",
  cursor_legacy: "Cursor (.cursorrules)",
  windsurf: "Windsurf (.windsurfrules)",
  frontmatter_markdown: "Markdown + frontmatter",
  generic_markdown: "Markdown",
};

export function SkillImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportSkillPreview | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setText("");
    setFilename(null);
    setPreview(null);
    setName("");
    setDescription("");
  };
  const close = () => {
    reset();
    onClose();
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setFilename(f.name);
  };

  const doPreview = async () => {
    if (!text.trim()) {
      toast.error("Paste a skill or choose a file first.");
      return;
    }
    setBusy(true);
    try {
      const p = await api.skills.import({ text, filename, commit: false });
      setPreview(p);
      setName(p.name);
      setDescription(p.description);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't parse that file.");
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    if (!preview) return;
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setBusy(true);
    try {
      const created = await api.skills.create({
        name: name.trim(),
        slug: preview.slug,
        description: description.trim() || null,
        system_prompt: preview.system_prompt,
        status: "draft",
        phases: [],
      });
      toast.success("Skill imported as a draft.");
      close();
      router.push(`/skills/${created.id}/edit`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the skill.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Import a skill"
      description="Bring a competency you wrote for Claude Code, Cursor, Windsurf, or any agent. Paste it or upload the file - the format is detected automatically."
      size="lg"
      footer={
        preview ? (
          <>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>
              Back
            </Button>
            <Button onClick={doSave} disabled={busy} data-testid="skill-import-save">
              {busy ? "Saving…" : "Save as draft"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={doPreview}
              disabled={busy || !text.trim()}
              data-testid="skill-import-preview"
            >
              {busy ? "Parsing…" : "Preview"}
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <input
              ref={fileRef}
              type="file"
              accept=".md,.mdc,.cursorrules,.windsurfrules,.txt,.markdown"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Choose file
            </Button>
            {filename && (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                <FileText className="size-3.5" />
                {filename}
              </span>
            )}
          </Cluster>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (filename) setFilename(null);
            }}
            placeholder="…or paste your SKILL.md / .cursorrules / markdown here"
            className="input min-h-[240px] font-mono text-xs leading-relaxed"
            data-testid="skill-import-text"
          />
        </Stack>
      ) : (
        <Stack gap="3" data-testid="skill-import-preview-panel">
          <Cluster gap="2" align="center">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--primary-ink)]">
              <Sparkles className="size-3" />
              {FORMAT_LABELS[preview.detected_format] ?? preview.detected_format}
            </span>
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {preview.slug}
            </span>
          </Cluster>
          {preview.warnings.length > 0 && (
            <Stack gap="1" className="rounded-md border border-[var(--warning)] bg-[var(--warning-soft)] p-2">
              {preview.warnings.map((w) => (
                <p key={w} className="text-xs text-[var(--warning-ink)]">
                  {w}
                </p>
              ))}
            </Stack>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              data-testid="skill-import-name"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
              Description
            </span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
            />
          </label>
          <Stack gap="1">
            <span className="text-xs font-medium text-[var(--text-muted)]">
              Body (the skill&apos;s instructions - refine after import)
            </span>
            <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text)]">
              {preview.system_prompt}
            </pre>
          </Stack>
        </Stack>
      )}
    </Modal>
  );
}
