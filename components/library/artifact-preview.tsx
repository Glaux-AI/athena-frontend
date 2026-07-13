"use client";

/**
 * ArtifactPreview - the format-appropriate body of an artifact, one preview per
 * format (design §7.2). Composes the existing rendering stack: ArtifactMarkdown
 * for docs, a sandboxed iframe for HTML, an authed blob image, a PDF/download
 * card for files, and a provider card for links. No new markdown renderer.
 */

import { useEffect, useState } from "react";
import { Download, ExternalLink } from "lucide-react";

import { ArtifactMarkdown } from "@/components/work/artifact-markdown";
import { Button } from "@/components/ui/button";
import { api, type LibraryArtifactDetail } from "@/lib/api/client";

export function ArtifactPreview({ artifact }: { artifact: LibraryArtifactDetail }) {
  switch (artifact.format) {
    case "doc":
      return <DocPreview body={artifact.body ?? ""} />;
    case "html":
      return <HtmlPreview body={artifact.body ?? ""} title={artifact.title} />;
    case "image":
      return <ImagePreview artifact={artifact} />;
    case "file":
      return <FilePreview artifact={artifact} />;
    case "link":
      return <LinkPreview artifact={artifact} />;
    default:
      return null;
  }
}

function DocPreview({ body }: { body: string }) {
  if (!body.trim()) return <Muted>This document is empty.</Muted>;
  return <ArtifactMarkdown text={body} />;
}

function HtmlPreview({ body, title }: { body: string; title: string }) {
  const [showSource, setShowSource] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setShowSource((s) => !s)}>
          {showSource ? "Preview" : "View source"}
        </Button>
      </div>
      {showSource ? (
        <pre className="max-h-[60vh] overflow-auto rounded-lg bg-[var(--code-bg)] p-3 text-xs text-[var(--text)]">
          <code>{body}</code>
        </pre>
      ) : (
        <iframe
          title={`Preview of ${title}`}
          sandbox="allow-scripts"
          srcDoc={body}
          className="min-h-[24rem] w-full rounded-lg border border-[var(--border)] bg-white"
        />
      )}
    </div>
  );
}

function ImagePreview({ artifact }: { artifact: LibraryArtifactDetail }) {
  const url = useBlobUrl(artifact.display_id, artifact.attachment_id);
  if (url === "error") return <Muted>Image unavailable.</Muted>;
  if (!url) return <div className="skeleton h-64 w-full rounded-lg" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={artifact.title}
      className="max-h-[70vh] w-full rounded-lg object-contain"
    />
  );
}

function FilePreview({ artifact }: { artifact: LibraryArtifactDetail }) {
  const url = useBlobUrl(artifact.display_id, artifact.attachment_id);
  const isPdf = artifact.mime_type === "application/pdf";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text)]">{artifact.filename ?? artifact.title}</p>
          <p className="text-micro text-[var(--text-subtle)]">{artifact.mime_type}</p>
        </div>
        {url && url !== "error" && (
          <a href={url} download={artifact.filename ?? artifact.title}>
            <Button variant="secondary" size="sm">
              <Download className="mr-1.5 size-4" aria-hidden /> Download
            </Button>
          </a>
        )}
      </div>
      {isPdf && url && url !== "error" && (
        <object
          data={url}
          type="application/pdf"
          className="min-h-[60vh] w-full rounded-lg border border-[var(--border)]"
          aria-label={artifact.title}
        >
          <Muted>PDF preview unavailable - use Download.</Muted>
        </object>
      )}
    </div>
  );
}

function LinkPreview({ artifact }: { artifact: LibraryArtifactDetail }) {
  const provider = (artifact.external_ref?.["provider"] as string | undefined) ?? "link";
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
        <p className="text-micro uppercase tracking-wide text-[var(--text-subtle)]">{provider}</p>
        <p className="mt-1 truncate text-sm text-[var(--text-muted)]">{artifact.url}</p>
        {artifact.url && (
          <a href={artifact.url} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block">
            <Button variant="secondary" size="sm">
              <ExternalLink className="mr-1.5 size-4" aria-hidden /> Open in {provider}
            </Button>
          </a>
        )}
      </div>
      {artifact.summary && (
        <p className="text-sm leading-relaxed text-[var(--text-muted)]">{artifact.summary}</p>
      )}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-[var(--text-subtle)]">{children}</p>;
}

/** Fetch an authed blob URL for the artifact's bytes; revoke on unmount. Returns
 *  `undefined` while loading, the URL when ready, or `"error"` on failure. */
function useBlobUrl(ref: string, attachmentId: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!attachmentId) {
      setUrl("error");
      return;
    }
    let revoked: string | null = null;
    let alive = true;
    api.artifacts
      .contentUrl(ref)
      .then((u) => {
        if (!alive) {
          URL.revokeObjectURL(u);
          return;
        }
        revoked = u;
        setUrl(u);
      })
      .catch(() => alive && setUrl("error"));
    return () => {
      alive = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [ref, attachmentId]);
  return url;
}
