"use client";

/**
 * SandboxPanel - the repo Sandbox tab (ADR-086, Inc 1).
 *
 * Configures the per-repo build+test recipe Athena will use to warm a snapshot
 * and verify diffs inside the per-tenant, deny-all-egress sandbox. Inc 1 ships
 * the CONFIG surface only: the execution loop is gated off server-side, so for
 * everyone today `status.state === "disabled"` and this renders the calm
 * "coming soon / paid plans" empty state. When the feature + tier allow it, the
 * detect -> review -> save flow stores the recipe (the actual snapshot build
 * lands in a later increment).
 *
 * Self-contained: fetches its own status on mount so the page stays surgical.
 */

import { useCallback, useEffect, useState } from "react";
import { Boxes, Lock, ShieldCheck, Wand2 } from "lucide-react";

import { api } from "@/lib/api/client";
import type { SandboxConfig, SandboxSpec, SandboxStatus } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";

const BASE_IMAGES = [
  "node-20", "node-22", "python-3.11", "python-3.12",
  "go-1.22", "java-21", "rust-1.79", "ubuntu-22.04",
] as const;

const EMPTY_SPEC: SandboxSpec = {
  base_image: "node-22",
  install_commands: [],
  build_command: null,
  test_command: null,
  test_select_cmd: null,
  working_subdir: null,
  env: {},
  resource_profile: "default",
};

function DenyAllFooter() {
  return (
    <Cluster className="items-center gap-2 text-xs text-[var(--text-muted)]">
      <ShieldCheck className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden />
      <span>
        This sandbox can edit, build, and run unit tests only. No internet access.
        No integration tests. No secrets leave your repo.
      </span>
    </Cluster>
  );
}

export function SandboxPanel({ repoId }: { repoId: string }) {
  const [status, setStatus] = useState<SandboxStatus | null>(null);
  const [config, setConfig] = useState<SandboxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [spec, setSpec] = useState<SandboxSpec>(EMPTY_SPEC);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.repos.sandbox.status(repoId);
      setStatus(s);
      setConfig(s.state === "configured" ? await api.repos.sandbox.getConfig(repoId) : null);
      setError(null);
    } catch {
      setError("Could not load the sandbox status.");
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startSetup = useCallback(async () => {
    setEditing(true);
    if (config) {
      setSpec(config.spec);
      return;
    }
    setDetecting(true);
    try {
      const d = await api.repos.sandbox.autodetect(repoId);
      setSpec(d.spec);
    } catch {
      setSpec(EMPTY_SPEC);
    } finally {
      setDetecting(false);
    }
  }, [repoId, config]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.repos.sandbox.putConfig(repoId, { spec, status: "configured" });
      setEditing(false);
      await refresh();
    } catch {
      setError("Could not save the sandbox config.");
    } finally {
      setSaving(false);
    }
  }, [repoId, spec, refresh]);

  if (loading) {
    return (
      <Stack className="gap-3" aria-busy>
        <div className="h-24 animate-pulse rounded-lg bg-[var(--surface-2)]" />
        <div className="h-40 animate-pulse rounded-lg bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<Boxes className="h-6 w-6" />}
        title="Sandbox unavailable"
        description={error}
        action={<Button variant="secondary" onClick={() => void refresh()}>Retry</Button>}
      />
    );
  }

  if (editing) {
    return (
      <SandboxForm
        spec={spec}
        onChange={setSpec}
        onCancel={() => setEditing(false)}
        onSave={save}
        detecting={detecting}
        saving={saving}
      />
    );
  }

  if (status?.state === "disabled") {
    return (
      <Stack className="gap-4">
        <EmptyState
          icon={<Lock className="h-6 w-6" />}
          title="Build + test sandbox"
          description={status.message}
        />
        <DenyAllFooter />
      </Stack>
    );
  }

  if (status?.state === "unconfigured") {
    return (
      <Stack className="gap-4">
        <EmptyState
          icon={<Boxes className="h-6 w-6" />}
          title="Set up the sandbox"
          description="Athena builds and unit-tests your changes before opening a PR, so the PR is right the first time. Configure the build once and Athena keeps it warm."
          action={
            <Button onClick={() => void startSetup()}>
              <Wand2 className="h-4 w-4" /> Set up sandbox
            </Button>
          }
        />
        <DenyAllFooter />
      </Stack>
    );
  }

  // configured
  const recipe = config?.spec;
  return (
    <Stack className="gap-4">
      <Card className="p-4">
        <Stack className="gap-3">
          <Cluster className="items-center justify-between">
            <Cluster className="items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--success)]" aria-hidden />
              <span className="text-sm font-medium text-[var(--text)]">Sandbox configured</span>
            </Cluster>
            <Button variant="secondary" size="sm" onClick={() => void startSetup()}>Edit</Button>
          </Cluster>
          <RecipeRow label="Base image" value={recipe?.base_image} />
          <RecipeRow label="Install" value={recipe?.install_commands.join("  &&  ") || undefined} />
          <RecipeRow label="Build" value={recipe?.build_command ?? undefined} />
          <RecipeRow label="Unit tests" value={recipe?.test_command ?? undefined} />
        </Stack>
      </Card>
      <DenyAllFooter />
    </Stack>
  );
}

function RecipeRow({ label, value }: { label: string; value: string | undefined }) {
  return (
    <Cluster className="items-baseline gap-3 text-sm">
      <span className="w-28 shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="font-mono text-[var(--text)]">{value ?? "not set"}</span>
    </Cluster>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <Stack className="gap-1">
      <label className="text-xs font-medium text-[var(--text-muted)]">{label}</label>
      {children}
      {hint && <span className="text-[11px] text-[var(--text-muted)]">{hint}</span>}
    </Stack>
  );
}

const inputCls = cn(
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)]",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
);

function SandboxForm({
  spec, onChange, onCancel, onSave, detecting, saving,
}: {
  spec: SandboxSpec;
  onChange: (s: SandboxSpec) => void;
  onCancel: () => void;
  onSave: () => void;
  detecting: boolean;
  saving: boolean;
}) {
  const set = <K extends keyof SandboxSpec>(k: K, v: SandboxSpec[K]) =>
    onChange({ ...spec, [k]: v });

  return (
    <Card className="p-4">
      <Stack className="gap-4">
        <Cluster className="items-center gap-2 text-sm text-[var(--text-muted)]">
          <Wand2 className="h-4 w-4" aria-hidden />
          {detecting ? "Detecting your build..." : "Review the detected recipe and adjust as needed."}
        </Cluster>

        <Field label="Base image">
          <select
            className={inputCls}
            value={spec.base_image}
            onChange={(e) => set("base_image", e.target.value)}
          >
            {BASE_IMAGES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>

        <Field label="Install commands" hint="One per line. Runs once at snapshot build (the only time the network is used).">
          <textarea
            className={cn(inputCls, "min-h-[64px] font-mono")}
            value={spec.install_commands.join("\n")}
            onChange={(e) => set("install_commands", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
            placeholder="npm ci"
          />
        </Field>

        <Field label="Build command">
          <input
            className={cn(inputCls, "font-mono")}
            value={spec.build_command ?? ""}
            onChange={(e) => set("build_command", e.target.value || null)}
            placeholder="npm run build"
          />
        </Field>

        <Field label="Unit test command" hint="Build and unit tests only. No integration tests, no network.">
          <input
            className={cn(inputCls, "font-mono")}
            value={spec.test_command ?? ""}
            onChange={(e) => set("test_command", e.target.value || null)}
            placeholder="npm test"
          />
        </Field>

        <Cluster className="items-center justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={onSave} loading={saving} disabled={detecting}>Save</Button>
        </Cluster>
        <DenyAllFooter />
      </Stack>
    </Card>
  );
}
