"use client";

/**
 * AiAccessChoice - the AI-access decision a Free workspace makes during
 * onboarding (plan step).
 *
 * Free orgs ship with no AI credit, so "Start free" can't silently drop the
 * user into setup - the first run would just hit the credit wall. This step
 * makes the choice explicit and resolvable in place:
 *
 *   - Bring your own key (free) - opens the same catalog `AddProviderSheet`
 *     used in Settings, so a key is saved without leaving onboarding. A saved
 *     key auto-wires routing server-side, so the workspace is immediately
 *     usable.
 *   - Use Athena credit - opens the top-up modal. (Included credit instead?
 *     The Back link returns to the Solo / Pro cards.)
 *
 * Either path - or an explicit skip - lands the user in setup.
 */

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CreditCard, KeyRound } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Stack, Cluster } from "@/components/layout/primitives";
import { AddProviderSheet } from "@/components/settings/models/add-provider-sheet";
import { CreditsTopupModal } from "@/components/billing/credits-topup-modal";

export function AiAccessChoice({
  orgId,
  onContinue,
  onBack,
}: {
  orgId: string;
  /** Proceed to the setup wizard. */
  onContinue: () => void;
  /** Return to the plan cards (e.g. to pick Solo / Pro for included credit). */
  onBack: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const [keyAdded, setKeyAdded] = useState(false);

  return (
    <Card variant="elevated" data-testid="ai-access-choice" className="border-[var(--border-accent)]">
      <Stack gap="4">
        <Stack gap="1">
          <h2 className="text-lg font-semibold">How should Athena power its AI?</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Free workspaces don&apos;t include AI credit - pick how you&apos;ll run models.
          </p>
        </Stack>

        {keyAdded ? (
          <Cluster
            gap="3"
            align="center"
            className="rounded-lg border border-[var(--success)] bg-[var(--success-soft)] p-4"
            data-testid="ai-access-key-added"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--success)] text-[var(--success-fg)]">
              <Check className="size-5" aria-hidden />
            </span>
            <Stack gap="0" className="min-w-0 flex-1">
              <span className="text-sm font-semibold">Your key is saved.</span>
              <span className="text-xs text-[var(--text-muted)]">
                Athena will run on your key - no credit needed.
              </span>
            </Stack>
            <Button onClick={onContinue} data-testid="ai-access-continue-after-key">
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </Cluster>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceTile
              icon={<KeyRound className="size-5" />}
              title="Use your own key"
              tag="Free"
              body="Bring an OpenAI, Anthropic, Gemini, or free-tier key."
              cta="Add a key"
              ctaVariant="default"
              onClick={() => setSheetOpen(true)}
              testid="ai-access-byo"
            />
            <ChoiceTile
              icon={<CreditCard className="size-5" />}
              title="Use Athena credit"
              body="Buy credit to run on Athena's managed models."
              cta="Buy credit"
              ctaVariant="outline"
              onClick={() => setTopupOpen(true)}
              testid="ai-access-credit"
            />
          </div>
        )}

        <Cluster justify="between" align="center" className="flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="ai-access-back">
            <ArrowLeft className="size-3.5" />
            Want credit included? Choose Solo or Pro
          </Button>
          {!keyAdded && (
            <Button variant="ghost" size="sm" onClick={onContinue} data-testid="ai-access-skip">
              Skip - set this up later
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </Cluster>
      </Stack>

      <AddProviderSheet
        open={sheetOpen}
        orgId={orgId}
        existingProviders={[]}
        onClose={() => setSheetOpen(false)}
        onCreated={() => setKeyAdded(true)}
      />
      <CreditsTopupModal
        open={topupOpen}
        onOpenChange={setTopupOpen}
        orgId={orgId}
        tier="free"
        onTopupReturn={onContinue}
      />
    </Card>
  );
}


function ChoiceTile({
  icon, title, tag, body, cta, ctaVariant, onClick, testid,
}: {
  icon: React.ReactNode;
  title: string;
  tag?: string;
  body: string;
  cta: string;
  ctaVariant: "default" | "outline";
  onClick: () => void;
  testid: string;
}) {
  return (
    <Stack
      gap="3"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-4 transition-[border-color] hover:border-[var(--border-strong)]"
    >
      <Cluster gap="2" align="center">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--primary-soft)] text-[var(--primary)]">
          {icon}
        </span>
        <Cluster gap="2" align="center">
          <span className="text-sm font-semibold">{title}</span>
          {tag && <Pill tone="success" size="sm">{tag}</Pill>}
        </Cluster>
      </Cluster>
      <p className="flex-1 text-xs text-[var(--text-muted)]">{body}</p>
      <Button variant={ctaVariant} size="sm" onClick={onClick} className="w-full" data-testid={testid}>
        {cta}
      </Button>
    </Stack>
  );
}
