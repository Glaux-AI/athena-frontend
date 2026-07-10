"use client";

/**
 * ToolsPanel - the Tool Registry (AR.2) list + inline editor. Build custom
 * tools (wrap a built-in, or alias a connected MCP tool), validate them, then
 * add them to an agent. Rendered as the "Tools" tab of the top-level `/agents`
 * page. Anyone who can build agents can build PRIVATE tools; sharing needs the
 * "Share custom tools" permission.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleSlash, Pencil, Plus, ShieldQuestion, Trash2, Upload, Wrench } from "lucide-react";

import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { ToolEditor } from "@/components/settings/tools/tool-editor";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Modal } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { usePermissions } from "@/lib/session/use-permissions";
import { api, ApiError, type CustomTool, type OpenApiImportResult } from "@/lib/api/client";

function OpenApiImportModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [specText, setSpecText] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [preview, setPreview] = useState<OpenApiImportResult["tools"] | null>(null);
  const [busy, setBusy] = useState(false);

  const parseSpec = (): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(specText);
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        toast.error("The spec must be a JSON object.");
        return null;
      }
      return v as Record<string, unknown>;
    } catch {
      toast.error("That isn't valid JSON.");
      return null;
    }
  };

  const run = async (commit: boolean) => {
    const spec = parseSpec();
    if (!spec) return;
    try {
      setBusy(true);
      const r = await api.tools.importOpenapi(spec, baseUrl.trim() || null, commit);
      if (commit) {
        toast.success(`Created ${r.created} tool(s). Allowlist the host + validate to use them.`);
        setSpecText("");
        setPreview(null);
        onCreated();
      } else {
        setPreview(r.tools);
        if (!r.tools.length) toast.error("No https operations were found.");
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from OpenAPI"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => void run(false)} disabled={busy || !specText.trim()}>Preview</Button>
          <Button onClick={() => void run(true)} disabled={busy || !preview?.length} data-testid="openapi-create">
            {preview?.length ? `Create ${preview.length} tool${preview.length === 1 ? "" : "s"}` : "Create"}
          </Button>
        </>
      }
    >
      <Stack gap="3">
        <p className="text-xs text-[var(--text-muted)]">
          Paste an OpenAPI 3.x spec (JSON). Each https operation becomes a private, unvalidated
          HTTP tool - allowlist the host and validate each before agents can use them.
        </p>
        <input
          type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL override (optional, e.g. https://api.example.com)"
          className="input font-mono"
        />
        <textarea
          value={specText}
          onChange={(e) => { setSpecText(e.target.value); setPreview(null); }}
          placeholder={'{ "openapi": "3.0.0", "servers": [...], "paths": {...} }'}
          className="input min-h-[160px] font-mono text-xs"
          data-testid="openapi-spec"
        />
        {preview && preview.length > 0 && (
          <Stack gap="1" className="max-h-[200px] overflow-y-auto">
            {preview.map((t) => (
              <Cluster key={t.slug} gap="2" align="center" className="rounded-md border border-[var(--border)] px-2.5 py-1.5">
                <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-micro text-[var(--text-muted)]">{t.method}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{t.url}</span>
              </Cluster>
            ))}
          </Stack>
        )}
      </Stack>
    </Modal>
  );
}

function EgressAllowlistCard() {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.tools.egressAllowlist
      .get()
      .then((a) => { setText(a.hosts.join("\n")); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    const hosts = text.split(/[\s,]+/).map((h) => h.trim()).filter(Boolean);
    try {
      setSaving(true);
      const res = await api.tools.egressAllowlist.set(hosts);
      setText(res.hosts.join("\n"));
      toast.success("Egress allowlist saved");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save allowlist.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <Stack gap="3">
        <Stack gap="0">
          <span className="text-sm font-semibold">HTTP egress allowlist</span>
          <span className="text-xs text-[var(--text-muted)]">
            Hostnames custom HTTP tools may call (one per line). Default-deny: a host must be
            listed here before any HTTP tool can reach it.
          </span>
        </Stack>
        <hr className="hr-horizon" aria-hidden />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!loaded}
          className="input min-h-[90px] font-mono text-xs"
          placeholder={"api.example.com\nhooks.slack.com"}
          data-testid="egress-allowlist"
        />
        <Cluster justify="end">
          <Button variant="outline" onClick={() => void save()} disabled={saving || !loaded}>
            {saving ? "Saving…" : "Save allowlist"}
          </Button>
        </Cluster>
      </Stack>
    </Card>
  );
}

type View = { kind: "list" } | { kind: "editor"; initial: CustomTool | null };

const STATUS: Record<CustomTool["validation_status"], { label: string; tone: PillTone; Icon: typeof CheckCircle2 }> = {
  valid: { label: "Validated", tone: "success", Icon: CheckCircle2 },
  unvalidated: { label: "Not validated", tone: "neutral", Icon: ShieldQuestion },
  invalid: { label: "Invalid", tone: "danger", Icon: CircleSlash },
};

export function ToolsPanel() {
  const { can } = usePermissions();
  const canAuthor = can("tools:author");
  const canManageAny = can("agents:manage_any");

  const [tools, setTools] = useState<CustomTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<CustomTool | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    try {
      setTools(await api.tools.list());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load tools.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openEdit = async (id: string) => {
    try {
      setBusyId(id);
      setView({ kind: "editor", initial: await api.tools.get(id) });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to open tool.");
    } finally {
      setBusyId(null);
    }
  };

  const validate = async (t: CustomTool) => {
    try {
      setBusyId(t.id);
      const updated = await api.tools.validate(t.id);
      toast[updated.validation_status === "valid" ? "success" : "error"](
        updated.validation_status === "valid" ? "Tool validated" : updated.last_validation_error || "Validation failed",
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Validation failed.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: CustomTool) => {
    try {
      setDeleting(true);
      setBusyId(t.id);
      await api.tools.delete(t.id);
      toast.success("Tool deleted");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to delete tool.");
    } finally {
      setDeleting(false);
      setBusyId(null);
      setConfirmTarget(null);
    }
  };

  if (view.kind === "editor") {
    return (
      <Stack gap="6">
        <SettingsPageHeader
          title={view.initial ? "Edit tool" : "New tool"}
          subtitle="A custom tool an agent can call. Validate it before agents can use it."
          as="h2"
        />
        <ToolEditor
          initial={view.initial}
          canPublish={can("tools:publish")}
          onCancel={() => setView({ kind: "list" })}
          onSaved={() => { setView({ kind: "list" }); void reload(); }}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="5">
      {canAuthor && (
        <Cluster gap="2" justify="end">
          <Button variant="outline" onClick={() => setImporting(true)} data-testid="tools-import">
            <Upload className="size-4" />Import OpenAPI
          </Button>
          <Button onClick={() => setView({ kind: "editor", initial: null })} data-testid="tools-new">
            <Plus className="size-4" />New tool
          </Button>
        </Cluster>
      )}

      <OpenApiImportModal
        open={importing}
        onClose={() => setImporting(false)}
        onCreated={() => { setImporting(false); void reload(); }}
      />

      {can("mcp:manage") && <EgressAllowlistCard />}

      {error && (
        <div className="rounded-lg border border-[var(--border-strong)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger-ink)]">
          {error}
        </div>
      )}

      {loading ? (
        <Grid cols="auto-fit-320" gap="4" aria-busy="true" aria-label="Loading tools">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <Stack gap="3">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-3 w-full rounded-md" />
              </Stack>
            </Card>
          ))}
        </Grid>
      ) : tools.length === 0 ? (
        <EmptyState
          icon={<Wrench className="size-6" />}
          title="No custom tools yet"
          description={canAuthor ? "Wrap a built-in tool or alias one of your MCP tools, then add it to an agent." : "Ask a teammate with build access to create one."}
          {...(canAuthor ? { action: <Button onClick={() => setView({ kind: "editor", initial: null })}><Plus className="size-4" />New tool</Button> } : {})}
        />
      ) : (
        <Grid cols="auto-fit-320" gap="4">
          {tools.map((t) => {
            const editable = t.is_owner || canManageAny;
            const s = STATUS[t.validation_status];
            return (
              <Card key={t.id} variant="moment" className="h-full">
                <Stack gap="3">
                  <Cluster justify="between" align="start">
                    <Stack gap="0">
                      <h3 className="text-base font-semibold leading-tight">{t.name}</h3>
                      <span className="text-xs text-[var(--text-muted)]">{t.slug} · {t.kind}</span>
                    </Stack>
                    <Pill size="sm" tone={s.tone} className="[&>span]:inline-flex [&>span]:items-center [&>span]:gap-1">
                      <s.Icon className="size-3" />{s.label}
                    </Pill>
                  </Cluster>
                  <Tooltip content={t.description} className="max-w-xs text-xs">
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm text-[var(--text-muted)]">{t.description}</p>
                  </Tooltip>
                  {t.validation_status === "invalid" && t.last_validation_error && (
                    <p className="text-xs text-[var(--danger-ink)]">{t.last_validation_error}</p>
                  )}
                  {editable && (
                    <Stack gap="3">
                      <hr className="hr-horizon" aria-hidden />
                      <Cluster gap="2" justify="end">
                        {t.validation_status !== "valid" && (
                          <Button variant="outline" onClick={() => void validate(t)} disabled={busyId === t.id} data-testid={`tool-validate-${t.slug}`}>
                            Validate
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => void openEdit(t.id)} disabled={busyId === t.id} data-testid={`tool-edit-${t.slug}`}>
                          <Pencil className="size-3.5" />Edit
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmTarget(t)} disabled={busyId === t.id} className="text-[var(--danger-ink)] hover:bg-[var(--danger-soft)]">
                          <Trash2 className="size-3.5" />Delete
                        </Button>
                      </Cluster>
                    </Stack>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Grid>
      )}

      <ConfirmDialog
        open={confirmTarget != null}
        onClose={() => { if (!deleting) setConfirmTarget(null); }}
        onConfirm={() => { if (confirmTarget) void remove(confirmTarget); }}
        tone="danger"
        title={`Delete the "${confirmTarget?.name ?? ""}" tool?`}
        description="This can't be undone."
        confirmLabel="Delete tool"
        loading={deleting}
      />
    </Stack>
  );
}
