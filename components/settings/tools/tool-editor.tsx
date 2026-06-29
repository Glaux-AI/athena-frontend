"use client";

/**
 * <ToolEditor/> - create / edit a custom tool (Tool Registry, AR.2).
 *
 * Two kinds in AR.2: `wrapper` (a built-in catalog tool with pinned args) and
 * `mcp` (alias one tool on a connected MCP server). Both are validated against
 * what they reference. The optional `input_schema` (JSON Schema) describes the
 * arguments the agent supplies at call time. Raw `http` tools arrive in AR.3.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import {
  api,
  ApiError,
  type AgentToolCatalog,
  type CreateToolIn,
  type CustomTool,
  type Domain,
} from "@/lib/api/client";
import { cn } from "@/lib/cn";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type Kind = "wrapper" | "mcp" | "http";
type Visibility = "private" | "domain" | "org";

export function ToolEditor({
  initial,
  canPublish,
  onCancel,
  onSaved,
}: {
  initial: CustomTool | null;
  canPublish: boolean;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const mode = initial ? "edit" : "create";
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<Kind>((initial?.kind as Kind) ?? "wrapper");
  const [builtinName, setBuiltinName] = useState<string>(
    (initial?.config?.["builtin_name"] as string) ?? "",
  );
  const [mcpToolId, setMcpToolId] = useState<string>(
    (initial?.config?.["mcp_tool_id"] as string) ?? "",
  );
  const [pinnedArgs, setPinnedArgs] = useState<string>(
    initial?.config?.["pinned_args"]
      ? JSON.stringify(initial.config["pinned_args"], null, 2)
      : "",
  );
  const [httpMethod, setHttpMethod] = useState<string>(
    (initial?.config?.["method"] as string) ?? "GET",
  );
  const [httpUrl, setHttpUrl] = useState<string>(
    (initial?.config?.["url"] as string) ?? "",
  );
  const [headersText, setHeadersText] = useState<string>(
    initial?.config?.["headers"]
      ? JSON.stringify(initial.config["headers"], null, 2)
      : "",
  );
  const [schemaText, setSchemaText] = useState<string>(
    initial && Object.keys(initial.input_schema || {}).length
      ? JSON.stringify(initial.input_schema, null, 2)
      : "",
  );
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? "private");
  const [domainIds, setDomainIds] = useState<string[]>(initial?.attached_domains ?? []);

  const [catalog, setCatalog] = useState<AgentToolCatalog | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cat, doms] = await Promise.all([
          api.agents.toolCatalog(),
          api.domains.list(),
        ]);
        setCatalog(cat);
        setDomains(doms);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load builder data.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const slugError = useMemo<string | null>(() => {
    if (mode === "edit" || !slug) return null;
    return SLUG_PATTERN.test(slug) ? null : "Lowercase letters, digits, and hyphens.";
  }, [slug, mode]);

  const onNameChange = (v: string) => {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  };

  const parseJson = (label: string, txt: string): Record<string, unknown> | null => {
    if (!txt.trim()) return {};
    try {
      const v = JSON.parse(txt);
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        setError(`${label} must be a JSON object.`);
        return null;
      }
      return v as Record<string, unknown>;
    } catch {
      setError(`${label} is not valid JSON.`);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    if (mode === "create" && !SLUG_PATTERN.test(slug)) return setError("Slug format is invalid.");
    if (!description.trim()) return setError("A description is required (the agent reads it).");
    if (kind === "wrapper" && !builtinName) return setError("Pick a built-in tool to wrap.");
    if (kind === "mcp" && !mcpToolId) return setError("Pick an MCP tool to alias.");
    if (kind === "http" && !httpUrl.trim()) return setError("Enter the request URL.");

    const schema = parseJson("Input schema", schemaText);
    if (schema === null) return;
    let config: Record<string, unknown>;
    if (kind === "wrapper") {
      const pinned = parseJson("Pinned arguments", pinnedArgs);
      if (pinned === null) return;
      config = { builtin_name: builtinName, ...(Object.keys(pinned).length ? { pinned_args: pinned } : {}) };
    } else if (kind === "mcp") {
      config = { mcp_tool_id: mcpToolId };
    } else {
      const headers = parseJson("Headers", headersText);
      if (headers === null) return;
      config = {
        method: httpMethod,
        url: httpUrl.trim(),
        ...(Object.keys(headers).length ? { headers } : {}),
      };
    }
    if (visibility === "domain" && domainIds.length === 0) {
      return setError("Pick at least one domain to share with, or keep the tool private.");
    }

    setSubmitting(true);
    try {
      if (initial) {
        await api.tools.update(initial.id, {
          name: name.trim(),
          description: description.trim(),
          input_schema: schema,
          config,
          visibility,
          domain_ids: visibility === "domain" ? domainIds : [],
        });
      } else {
        const body: CreateToolIn = {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          kind,
          input_schema: schema,
          config,
          visibility,
          domain_ids: visibility === "domain" ? domainIds : [],
        };
        await api.tools.create(body);
      }
      toast.success(initial ? "Tool updated" : "Tool created. Validate it to let agents use it.");
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to save tool.";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDomain = (id: string) =>
    setDomainIds((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <form onSubmit={handleSubmit} aria-label={mode === "create" ? "Create tool" : "Edit tool"}>
      <Stack gap="4">
        <Card>
          <Stack gap="4">
            <Field label="Name" required>
              <input type="text" value={name} className="input" data-testid="tool-name"
                onChange={(e) => onNameChange(e.target.value)} placeholder="e.g. Search incidents" />
            </Field>
            <Field label="Slug" required helper="The tool id agents call. Lowercase + digits + hyphens.">
              <input type="text" value={slug} className="input font-mono" disabled={mode === "edit"}
                aria-invalid={!!slugError} data-testid="tool-slug"
                onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }}
                placeholder="search-incidents" />
              {slugError && <p className="mt-1 text-xs text-[var(--danger)]">{slugError}</p>}
            </Field>
            <Field label="Description" required helper="What the tool does + when to use it. The agent reads this.">
              <input type="text" value={description} className="input" data-testid="tool-description"
                onChange={(e) => setDescription(e.target.value)} placeholder="Search the incidents API by keyword." />
            </Field>
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Heading title="What it does" sub="Wrap a built-in Athena tool, or alias one of your connected MCP tools." />
            {mode === "edit" ? (
              <p className="text-xs text-[var(--text-muted)]">Kind: <span className="font-mono">{kind}</span> (fixed after creation)</p>
            ) : (
              <Cluster gap="2">
                <KindOption label="Wrap a built-in" desc="A catalog tool with pinned args" on={kind === "wrapper"} onPick={() => setKind("wrapper")} />
                <KindOption label="Alias an MCP tool" desc="One tool on a connected MCP server" on={kind === "mcp"} onPick={() => setKind("mcp")} />
                <KindOption label="HTTP request" desc="Call an allowlisted API" on={kind === "http"} onPick={() => setKind("http")} />
              </Cluster>
            )}
            {loading ? (
              <p className="text-sm text-[var(--text-muted)]">Loading…</p>
            ) : kind === "wrapper" ? (
              <Stack gap="3">
                <Field label="Built-in tool" required>
                  <select className="input font-mono" value={builtinName} data-testid="tool-builtin"
                    onChange={(e) => setBuiltinName(e.target.value)}>
                    <option value="">Select a built-in…</option>
                    {(catalog?.builtin ?? []).map((b) => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </select>
                </Field>
                <Field label="Pinned arguments (JSON)" helper="Args always sent, merged under the agent's. Optional.">
                  <textarea value={pinnedArgs} onChange={(e) => setPinnedArgs(e.target.value)}
                    className="input min-h-[100px] font-mono text-xs" placeholder='{ "repo": "auth-service" }' />
                </Field>
              </Stack>
            ) : kind === "mcp" ? (
              <Field label="MCP tool" required helper="Only auto-approval tools on connected servers are listed.">
                <select className="input" value={mcpToolId} data-testid="tool-mcp"
                  onChange={(e) => setMcpToolId(e.target.value)}>
                  <option value="">Select an MCP tool…</option>
                  {(catalog?.mcp ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.server} · {m.name}</option>
                  ))}
                </select>
              </Field>
            ) : (
              <Stack gap="3">
                <Field label="Method">
                  <select className="input font-mono" value={httpMethod} data-testid="tool-http-method"
                    onChange={(e) => setHttpMethod(e.target.value)}>
                    {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="URL" required helper="https only, host on the org egress allowlist. Use {param} in the path/query and ${secret:name} for a stored secret.">
                  <input type="text" className="input font-mono" value={httpUrl} data-testid="tool-http-url"
                    onChange={(e) => setHttpUrl(e.target.value)} placeholder="https://api.example.com/v1/items/{id}" />
                </Field>
                <Field label="Headers (JSON)" helper="Values may use ${secret:name}. Optional.">
                  <textarea value={headersText} onChange={(e) => setHeadersText(e.target.value)}
                    className="input min-h-[90px] font-mono text-xs" placeholder={'{ "Authorization": "Bearer ${secret:api_key}" }'} />
                </Field>
                <p className="text-[11px] text-[var(--text-subtle)]">
                  After creating it, set any secrets below, ask an admin to allowlist the host in
                  &quot;Egress allowlist&quot;, then Validate.
                </p>
              </Stack>
            )}
          </Stack>
        </Card>

        {mode === "edit" && kind === "http" && initial && (
          <ToolSecrets toolId={initial.id} />
        )}

        <Card>
          <Stack gap="3">
            <Heading title="Input schema (JSON Schema)" sub="The arguments the agent supplies. Leave empty for a no-argument tool." />
            <textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)}
              className="input min-h-[140px] font-mono text-xs" data-testid="tool-schema"
              placeholder={'{\n  "type": "object",\n  "properties": { "query": { "type": "string" } },\n  "required": ["query"]\n}'} />
          </Stack>
        </Card>

        <Card>
          <Stack gap="3">
            <Heading title="Sharing" sub="Who can add this tool to an agent." />
            <Cluster gap="2">
              <ScopeOption label="Private" desc="Only you" on={visibility === "private"} onPick={() => setVisibility("private")} />
              <ScopeOption label="Domains" desc="Chosen domains" on={visibility === "domain"} disabled={!canPublish} onPick={() => setVisibility("domain")} />
              <ScopeOption label="Org-wide" desc="Everyone" on={visibility === "org"} disabled={!canPublish} onPick={() => setVisibility("org")} />
            </Cluster>
            {!canPublish && <p className="text-xs text-[var(--text-subtle)]">Sharing needs the &quot;Share custom tools&quot; permission.</p>}
            {visibility === "domain" && (
              <Grid cols="auto-fit-220" gap="2">
                {domains.map((d) => (
                  <button key={d.id} type="button" onClick={() => toggleDomain(d.id)} aria-pressed={domainIds.includes(d.id)}
                    className={cn("flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
                      domainIds.includes(d.id) ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]")}>
                    <span className="text-xs font-medium text-[var(--text)]">{d.name}</span>
                    <span className="text-[10.5px] text-[var(--text-subtle)]">{d.slug}</span>
                  </button>
                ))}
              </Grid>
            )}
          </Stack>
        </Card>

        {error && (
          <Card className="border-[var(--danger)] bg-[var(--danger-soft)]">
            <p className="text-sm text-[var(--danger-ink)]" data-testid="tool-error">{error}</p>
          </Card>
        )}

        <Cluster justify="end" gap="2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" disabled={submitting} data-testid="tool-submit">
            {submitting ? "Saving…" : mode === "create" ? "Create tool" : "Save changes"}
          </Button>
        </Cluster>
      </Stack>
    </form>
  );
}

function Field({
  label, required, helper, children,
}: { label: string; required?: boolean; helper?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
        {label}{required && <span className="text-[var(--danger)]"> *</span>}
      </span>
      {children}
      {helper && <span className="mt-1 block text-[10.5px] text-[var(--text-subtle)]">{helper}</span>}
    </label>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <Stack gap="0" className="border-b border-[var(--border)] pb-2">
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-[var(--text-muted)]">{sub}</span>
    </Stack>
  );
}

function KindOption({ label, desc, on, onPick }: { label: string; desc: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={on}
      className={cn("flex flex-1 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
        on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]")}>
      <span className={cn("text-sm font-medium", on ? "text-[var(--primary)]" : "text-[var(--text)]")}>{label}</span>
      <span className="text-[10.5px] text-[var(--text-subtle)]">{desc}</span>
    </button>
  );
}

function ScopeOption({
  label, desc, on, disabled, onPick,
}: { label: string; desc: string; on: boolean; disabled?: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} disabled={disabled} aria-pressed={on}
      className={cn("flex flex-1 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
        on ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[var(--surface-2)]",
        disabled && "cursor-not-allowed opacity-50")}>
      <span className={cn("text-sm font-medium", on ? "text-[var(--primary)]" : "text-[var(--text)]")}>{label}</span>
      <span className="text-[10.5px] text-[var(--text-subtle)]">{desc}</span>
    </button>
  );
}

function ToolSecrets({ toolId }: { toolId: string }) {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setKeys((await api.tools.secrets.list(toolId)).map((s) => s.key));
    } catch {
      /* surfaced on first add */
    }
  }, [toolId]);
  useEffect(() => { void reload(); }, [reload]);

  const add = async () => {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(newKey)) { toast.error("Secret name: letters, digits, _ or -."); return; }
    if (!newValue) { toast.error("Enter a value."); return; }
    try {
      setBusy(true);
      await api.tools.secrets.set(toolId, newKey, newValue);
      toast.success("Secret saved");
      setNewKey(""); setNewValue("");
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to save secret.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (key: string) => {
    try {
      setBusy(true);
      await api.tools.secrets.delete(toolId, key);
      await reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to remove secret.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Stack gap="3">
        <Heading title="Secrets" sub="Reference these from the URL or headers as ${secret:name}. Stored encrypted; never shown again." />
        {keys.length > 0 && (
          <Stack gap="1">
            {keys.map((k) => (
              <Cluster key={k} justify="between" align="center" className="rounded-md border border-[var(--border)] px-2.5 py-1.5">
                <span className="font-mono text-xs text-[var(--text)]">{k}</span>
                <button type="button" onClick={() => void remove(k)} disabled={busy} className="text-xs text-[var(--danger)] hover:underline">Remove</button>
              </Cluster>
            ))}
          </Stack>
        )}
        <Cluster gap="2" align="end">
          <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="name (e.g. api_key)" className="input font-mono" data-testid="tool-secret-key" />
          <input type="password" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="value" className="input" data-testid="tool-secret-value" />
          <Button type="button" variant="outline" onClick={() => void add()} disabled={busy}>Add</Button>
        </Cluster>
      </Stack>
    </Card>
  );
}

function slugify(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
