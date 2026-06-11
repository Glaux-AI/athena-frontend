"use client";

/**
 * RoleEditor — create or edit one org role: name, description, and the
 * grouped permission picker.
 *
 * Permission groups come from `api.roles.catalog` (BE-owned labels +
 * descriptions, so a new backend permission shows up here without an FE
 * release). Each group header carries a tri-state select-all; dangerous
 * grants render with warning styling. A live search filter narrows the
 * grid — with ~55 permissions, finding "audit" must be one keystroke,
 * not a scroll hunt.
 */

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { cn } from "@/lib/cn";
import {
  api,
  ApiError,
  type OrgRole,
  type PermissionEntry,
  type PermissionGroup,
} from "@/lib/api/client";

export interface RoleDraft {
  name: string;
  description: string;
  permissions: string[];
}

export function RoleEditor({
  orgId,
  catalog,
  role,
  initialDraft,
  onSaved,
  onCancel,
}: {
  orgId: string;
  catalog: PermissionGroup[];
  /** Existing role when editing; null when creating. */
  role: OrgRole | null;
  /** Prefill for create mode (duplicate flow). Ignored when `role` set. */
  initialDraft?: RoleDraft | undefined;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role?.name ?? initialDraft?.name ?? "");
  const [description, setDescription] = useState(
    role?.description ?? initialDraft?.description ?? "",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role?.permissions ?? initialDraft?.permissions ?? []),
  );
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allKeys = useMemo(
    () => catalog.flatMap((g) => g.permissions.map((p) => p.key)),
    [catalog],
  );

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setMany = (keys: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        name: trimmed,
        description: description.trim() || null,
        permissions: [...selected],
      };
      if (role) {
        await api.roles.patch(orgId, role.id, body);
        toast.success(`Role "${trimmed}" updated`);
      } else {
        await api.roles.create(orgId, body);
        toast.success(`Role "${trimmed}" created`);
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save role");
      setBusy(false);
    }
  };

  const q = filter.trim().toLowerCase();
  const matches = (p: PermissionEntry) =>
    !q ||
    p.label.toLowerCase().includes(q) ||
    p.key.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q);

  return (
    <Card variant="elevated">
      <CardHeader>
        <Cluster justify="between" align="center">
          <Stack gap="0">
            <CardTitle>{role ? `Edit role — ${role.name}` : "New role"}</CardTitle>
            <CardDescription>
              Members with this role can do exactly what is checked below — nothing more.
            </CardDescription>
          </Stack>
          <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--primary)]">
            {selected.size} of {allKeys.length} permissions
          </span>
        </Cluster>
      </CardHeader>
      <CardContent>
        <Stack gap="4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[240px_1fr]">
            <Stack gap="1.5">
              <label htmlFor="role-name" className="text-xs font-medium text-[var(--text-muted)]">
                Name
              </label>
              <input
                id="role-name"
                type="text"
                value={name}
                maxLength={64}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Release captain"
                data-testid="role-name-input"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </Stack>
            <Stack gap="1.5">
              <label htmlFor="role-description" className="text-xs font-medium text-[var(--text-muted)]">
                Description <span className="font-normal text-[var(--text-subtle)]">(optional)</span>
              </label>
              <input
                id="role-description"
                type="text"
                value={description}
                maxLength={500}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this role for?"
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              />
            </Stack>
          </div>

          <Cluster gap="2" align="center" justify="between">
            <div className="flex max-w-xs flex-1 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 focus-within:border-[var(--primary)]">
              <Search className="size-3.5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
              <input
                type="search"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter permissions…"
                aria-label="Filter permissions"
                className="w-full bg-transparent text-sm focus:outline-none"
              />
            </div>
            <Cluster gap="1">
              <Button type="button" size="sm" variant="ghost" onClick={() => setMany(allKeys, true)}>
                Select all
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={selected.size === 0}
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </Cluster>
          </Cluster>

          <Stack gap="3">
            {catalog.map((group) => {
              const visible = group.permissions.filter(matches);
              if (visible.length === 0) return null;
              return (
                <PermissionGroupSection
                  key={group.key}
                  group={group}
                  visible={visible}
                  selected={selected}
                  onToggle={toggle}
                  onSetMany={setMany}
                />
              );
            })}
          </Stack>

          {error && (
            <p role="alert" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger-ink)]">
              {error}
            </p>
          )}

          <Cluster justify="end" gap="2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={busy || !name.trim()}
              loading={busy}
              data-testid="role-save"
            >
              <ShieldCheck className="size-3.5" />
              {role ? "Save changes" : "Create role"}
            </Button>
          </Cluster>
        </Stack>
      </CardContent>
    </Card>
  );
}

function PermissionGroupSection({
  group,
  visible,
  selected,
  onToggle,
  onSetMany,
}: {
  group: PermissionGroup;
  visible: PermissionEntry[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onSetMany: (keys: string[], on: boolean) => void;
}) {
  const groupKeys = group.permissions.map((p) => p.key);
  const checkedCount = groupKeys.filter((k) => selected.has(k)).length;
  const allChecked = checkedCount === groupKeys.length;
  const someChecked = checkedCount > 0 && !allChecked;
  const headerCheckbox = useRef<HTMLInputElement>(null);
  if (headerCheckbox.current) headerCheckbox.current.indeterminate = someChecked;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <label className="flex cursor-pointer items-center gap-2.5 border-b border-[var(--border)] px-3 py-2">
        <input
          ref={headerCheckbox}
          type="checkbox"
          checked={allChecked}
          onChange={(e) => onSetMany(groupKeys, e.target.checked)}
          aria-label={`Select all ${group.label} permissions`}
          className="size-3.5 accent-[var(--primary)]"
        />
        <span className="text-sm font-semibold">{group.label}</span>
        <span className="ml-auto text-xs text-[var(--text-subtle)]">
          {checkedCount}/{groupKeys.length}
        </span>
      </label>
      <div className="grid grid-cols-1 gap-x-4 p-2 md:grid-cols-2">
        {visible.map((p) => (
          <label
            key={p.key}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)]",
            )}
          >
            <input
              type="checkbox"
              checked={selected.has(p.key)}
              onChange={() => onToggle(p.key)}
              data-testid={`perm-${p.key}`}
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--primary)]"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm">
                {p.label}
                {p.danger && (
                  <AlertTriangle
                    className="size-3 shrink-0 text-[var(--warning)]"
                    aria-label="High-impact permission"
                  />
                )}
              </span>
              <span className="block text-xs leading-snug text-[var(--text-muted)]">
                {p.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}
