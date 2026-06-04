"use client";

/**
 * Settings → Org Standards.
 *
 * §3.21 row 4 — admin-facing entry point for editing the Org Blueprint
 * sections. The actual editing surface lives in `/knowledge?tab=blueprint`
 * (same TOC + section viewer + editor used by every other Blueprint scope
 * page); this settings page is a discovery-and-context shell that links
 * out + explains the governance flow so org owners can find it without
 * spelunking through Knowledge.
 *
 * Wiring is via `api.blueprint.org.editSection` → `PATCH
 * /v1/blueprint-sections/{id}` — the first human edit on a section flips
 * `protected_from_ai=true` (Phase 04 ADR-059). We don't duplicate the
 * editor UI here — single source of truth keeps the human-edit semantics
 * + protected-from-AI rollover consistent everywhere.
 */

import Link from "next/link";
import { ArrowRight, BookOpen, Lock, ShieldCheck, ScrollText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default function OrgStandardsPage() {
  return (
    <Stack gap="4">
      <SettingsPageHeader
        title="Org Standards"
        subtitle={
          <>
            The Org Blueprint is the source of truth for org-wide policies — ADRs, conventions, domain
            notes, ownership, observability, secrets handling, and environments. Every agent on every
            run reads it before generating output, and human edits flip a section to{" "}
            <span className="font-mono text-[var(--text)]">protected_from_ai</span> so AI sync can&apos;t
            overwrite the standard you set.
          </>
        }
      />

      <Card variant="elevated">
        <Stack gap="3">
          <Cluster gap="2" align="center">
            <BookOpen className="size-4 text-[var(--primary)]" aria-hidden />
            <span className="text-sm font-semibold">Edit Org Blueprint sections</span>
          </Cluster>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Open the Org Knowledge surface → Blueprint tab. The TOC on the left lists every section
            in the Org Blueprint. Click a section to view it; click <strong>Edit</strong> to revise
            the body. Saving writes a new revision and flips the section to{" "}
            <span className="font-mono">protected_from_ai</span> on first human edit; AI sync
            proposals on protected sections then route through the approval queue at{" "}
            <Link href="/blueprint-proposals" className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
              /blueprint-proposals
            </Link>{" "}
            instead of applying directly.
          </p>
          <Cluster gap="2">
            <Link
              href="/knowledge?tab=blueprint"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-fg)] shadow-[var(--inner-highlight)] transition-opacity hover:opacity-90"
            >
              Open Org Blueprint
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
            <Link
              href="/blueprint-proposals"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              <ScrollText className="size-3.5" aria-hidden />
              Approval queue
            </Link>
          </Cluster>
        </Stack>
      </Card>

      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <Lock className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">How protection works</span>
          </Cluster>
          <ul className="space-y-1 text-xs leading-relaxed text-[var(--text-muted)]">
            <li>
              <strong className="text-[var(--text)]">Authored</strong> sections — written by a human
              — never auto-update. AI proposes via the approval queue.
            </li>
            <li>
              <strong className="text-[var(--text)]">Synthesized</strong> sections — AI-generated —
              auto-update on every sync until a human edits them, after which they become protected.
            </li>
            <li>
              <strong className="text-[var(--text)]">Derived</strong> sections — sourced from
              external truth (CODEOWNERS, ADRs, etc.) — always auto-update regardless of protection.
              Edit the source if you need to change them.
            </li>
            <li>
              <strong className="text-[var(--text)]">Locked</strong> sections — explicitly held
              against any AI update. Use sparingly; locked sections still allow human edits.
            </li>
          </ul>
        </Stack>
      </Card>

      <Card>
        <Stack gap="2">
          <Cluster gap="2" align="center">
            <ShieldCheck className="size-4 text-[var(--text-muted)]" aria-hidden />
            <span className="text-sm font-semibold">Audit trail</span>
          </Cluster>
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            Every save is captured as a new revision. The <strong>View revisions</strong> button on
            any section opens a drawer with the last N revisions plus the author + change note.
          </p>
        </Stack>
      </Card>
    </Stack>
  );
}
