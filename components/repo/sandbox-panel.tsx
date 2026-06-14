"use client";

/**
 * SandboxPanel - the repo Sandbox tab (ADR-086).
 *
 * Configures the per-repo build+test recipe Athena uses to warm a snapshot and
 * verify diffs inside the per-tenant, deny-all-egress Fargate sandbox, and drives
 * the one-time warm-image build. The flow is: detect (from the repo's own files)
 * -> review -> save the recipe -> build the warm image -> Athena verifies every
 * change against it. Base image is free-form (a friendly key or any pinned public
 * image), so any toolchain works, not a fixed dropdown.
 *
 * Self-contained: fetches its own per-repo status on mount and polls while a
 * snapshot build is in flight.
 */

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Boxes, CheckCircle2, Hammer, Lock, ShieldCheck, Wand2,
} from "lucide-react";

import { api } from "@/lib/api/client";
import type { SandboxConfig, SandboxDetect, SandboxSpec, SandboxStatus } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Stack, Cluster } from "@/components/layout/primitives";
import { formatRelativeTime } from "@/lib/utils/format";
import { cn } from "@/lib/cn";

// Friendly-key suggestions for the base-image field; the field is free-form so a
// pinned public image (e.g. public.ecr.aws/docker/library/php:8.3-cli) works too.
const BASE_IMAGE_SUGGESTIONS = [
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
  const [detect, setDetect] = useState<SandboxDetect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [spec, setSpec] = useState<SandboxSpec>(EMPTY_SPEC);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);

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

  // A snapshot build runs server-side; poll while one is in flight so the tab
  // reflects building -> ready/failed without a manual reload.
  const isBuilding = building || status?.snapshot_status === "building";
  useEffect(() => {
    if (!isBuilding) return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [isBuilding, refresh]);
  useEffect(() => {
    if (status?.snapshot_status === "ready" || status?.snapshot_status === "failed") {
      setBuilding(false);
    }
  }, [status?.snapshot_status]);

  const startSetup = useCallback(async () => {
    setEditing(true);
    if (config) {
      setSpec(config.spec);
      setDetect(null);
      return;
    }
    setDetecting(true);
    try {
      const d = await api.repos.sandbox.autodetect(repoId);
      setSpec(d.spec);
      setDetect(d);
    } catch {
      setSpec(EMPTY_SPEC);
      setDetect(null);
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

  const build = useCallback(async () => {
    setBuilding(true);
    try {
      await api.repos.sandbox.build(repoId);
      await refresh();
    } catch {
      setError("Could not start the snapshot build.");
      setBuilding(false);
    }
  }, [repoId, refresh]);

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
        detect={detect}
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
          {recipe?.working_subdir && <RecipeRow label="Working dir" value={recipe.working_subdir} />}
          <RecipeRow label="Install" value={recipe?.install_commands.join("  &&  ") || undefined} />
          <RecipeRow label="Build" value={recipe?.build_command ?? undefined} />
          <RecipeRow label="Unit tests" value={recipe?.test_command ?? undefined} />
        </Stack>
      </Card>
      {status && (
        <SnapshotBlock status={status} isBuilding={isBuilding} onBuild={() => void build()} />
      )}
      <DenyAllFooter />
    </Stack>
  );
}

function SnapshotBlock({
  status, isBuilding, onBuild,
}: { status: SandboxStatus; isBuilding: boolean; onBuild: () => void }) {
  if (isBuilding) {
    return (
      <Card className="p-4">
        <Cluster className="items-center gap-2 text-sm text-[var(--text)]">
          <Hammer className="h-4 w-4 animate-pulse text-[var(--accent)]" aria-hidden />
          Building the warm image. This runs once and can take a few minutes.
        </Cluster>
      </Card>
    );
  }
  if (status.snapshot_status === "ready") {
    return (
      <Card className="p-4">
        <Cluster className="items-center justify-between gap-3">
          <Cluster className="items-center gap-2 text-sm text-[var(--text)]">
            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" aria-hidden />
            <span>
              Warm image ready
              {status.snapshot_built_at ? `, built ${formatRelativeTime(status.snapshot_built_at)}` : ""}.
            </span>
          </Cluster>
          <Button variant="secondary" size="sm" onClick={onBuild}>Rebuild</Button>
        </Cluster>
      </Card>
    );
  }
  if (status.snapshot_status === "failed") {
    return (
      <Card className="p-4">
        <Stack className="gap-3">
          <Cluster className="items-center gap-2 text-sm text-[var(--text)]">
            <AlertTriangle className="h-4 w-4 text-[var(--danger)]" aria-hidden />
            The last snapshot build failed. Check the recipe and try again.
          </Cluster>
          <Cluster className="justify-end">
            <Button size="sm" onClick={onBuild}><Hammer className="h-4 w-4" /> Retry build</Button>
          </Cluster>
        </Stack>
      </Card>
    );
  }
  // never built
  return (
    <Card className="p-4">
      <Stack className="gap-3">
        <Stack className="gap-1">
          <span className="text-sm font-medium text-[var(--text)]">Build the warm image</span>
          <span className="text-xs text-[var(--text-muted)]">
            Athena installs your dependencies once into a warm image, then reuses it to
            build and test every change. The sandbox stays inactive until this is built.
          </span>
        </Stack>
        <Cluster className="justify-end">
          <Button onClick={onBuild}><Hammer className="h-4 w-4" /> Build snapshot</Button>
        </Cluster>
      </Stack>
    </Card>
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

function ConfidencePill({ level }: { level: SandboxDetect["confidence"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        level === "high"
          ? "bg-[var(--success-soft)] text-[var(--success-ink)]"
          : "bg-[var(--warning-soft)] text-[var(--warning-ink)]",
      )}
    >
      {level} confidence
    </span>
  );
}

function Field({
  label, children, hint, flag,
}: { label: string; children: React.ReactNode; hint?: string; flag?: boolean }) {
  return (
    <Stack className="gap-1">
      <Cluster className="items-center justify-between gap-2">
        <label className="text-xs font-medium text-[var(--text-muted)]">{label}</label>
        {flag && (
          <Cluster className="items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <AlertTriangle className="h-3 w-3 text-[var(--warning)]" aria-hidden />
            double-check
          </Cluster>
        )}
      </Cluster>
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
  spec, detect, onChange, onCancel, onSave, detecting, saving,
}: {
  spec: SandboxSpec;
  detect: SandboxDetect | null;
  onChange: (s: SandboxSpec) => void;
  onCancel: () => void;
  onSave: () => void;
  detecting: boolean;
  saving: boolean;
}) {
  const set = <K extends keyof SandboxSpec>(k: K, v: SandboxSpec[K]) =>
    onChange({ ...spec, [k]: v });
  const low = (f: string) => detect?.low_confidence_fields.includes(f) ?? false;

  return (
    <Card className="p-4">
      <Stack className="gap-4">
        {detecting ? (
          <Cluster className="items-center gap-2 text-sm text-[var(--text-muted)]">
            <Wand2 className="h-4 w-4 animate-pulse" aria-hidden /> Detecting your build from the repo...
          </Cluster>
        ) : detect ? (
          <Stack className="gap-1.5">
            <Cluster className="items-center justify-between gap-2">
              <Cluster className="items-center gap-2 text-sm text-[var(--text)]">
                <Wand2 className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Detected recipe
              </Cluster>
              <ConfidencePill level={detect.confidence} />
            </Cluster>
            <span className="text-xs text-[var(--text-muted)]">{detect.note}</span>
          </Stack>
        ) : (
          <Cluster className="items-center gap-2 text-sm text-[var(--text-muted)]">
            <Wand2 className="h-4 w-4" aria-hidden /> Review the recipe and adjust as needed.
          </Cluster>
        )}

        <Field
          label="Base image"
          flag={low("base_image")}
          hint="A friendly key (node-22) or any pinned public image, e.g. public.ecr.aws/docker/library/php:8.3-cli"
        >
          <input
            list="sandbox-base-images"
            className={cn(inputCls, "font-mono")}
            value={spec.base_image}
            onChange={(e) => set("base_image", e.target.value)}
            placeholder="node-22"
          />
          <datalist id="sandbox-base-images">
            {BASE_IMAGE_SUGGESTIONS.map((b) => <option key={b} value={b} />)}
          </datalist>
        </Field>

        <Field
          label="Install commands"
          flag={low("install_commands")}
          hint="One per line. Runs once at snapshot build (the only time the network is used)."
        >
          <textarea
            className={cn(inputCls, "min-h-[64px] font-mono")}
            value={spec.install_commands.join("\n")}
            onChange={(e) => set("install_commands", e.target.value.split("\n").map((l) => l.trim()).filter(Boolean))}
            placeholder="npm ci"
          />
        </Field>

        <Field label="Build command" flag={low("build_command")}>
          <input
            className={cn(inputCls, "font-mono")}
            value={spec.build_command ?? ""}
            onChange={(e) => set("build_command", e.target.value || null)}
            placeholder="npm run build"
          />
        </Field>

        <Field
          label="Unit test command"
          flag={low("test_command")}
          hint="Build and unit tests only. No integration tests, no network."
        >
          <input
            className={cn(inputCls, "font-mono")}
            value={spec.test_command ?? ""}
            onChange={(e) => set("test_command", e.target.value || null)}
            placeholder="npm test"
          />
        </Field>

        <Field label="Working directory" hint="Optional. Leave blank to build at the repo root (monorepo sub-packages: set the package path).">
          <input
            className={cn(inputCls, "font-mono")}
            value={spec.working_subdir ?? ""}
            onChange={(e) => set("working_subdir", e.target.value || null)}
            placeholder="(repo root)"
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
