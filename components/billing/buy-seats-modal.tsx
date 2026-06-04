"use client";

/**
 * BuySeatsModal — §7.9.9 rows 2495..2498.
 *
 * Two-tab Radix Dialog (à la carte seats + upgrade-to-Pro). The Pro tab
 * is only visible on solo tier. Free orgs are short-circuited at the
 * caller (they route to /settings/billing?action=upgrade).
 *
 * Global open API lives in `lib/stores/buy-seats-modal.ts`:
 *   const { open, openWithContext, close } = useBuySeatsModal();
 * Mount-once host (`<BuySeatsModalHost />`) lives in AppShell.
 */

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, UserPlus, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Stack, Cluster } from "@/components/layout/primitives";
import { useSession } from "@/lib/session/SessionProvider";
import { api, ApiError, type SeatsOut } from "@/lib/api/client";
import {
  useBuySeatsModalStore,
  type BuySeatsModalContext,
} from "@/lib/stores/buy-seats-modal";
import { cn } from "@/lib/cn";

import { BuySeatsAlaCarteTab } from "./buy-seats-alacarte-tab";
import { BuySeatsUpgradeTab } from "./buy-seats-upgrade-tab";

type TabKey = "alacarte" | "upgrade";

/** Mount-once host. Use `<BuySeatsModalHost />` in AppShell; everywhere
 *  else use the `useBuySeatsModal()` hook. */
export function BuySeatsModalHost() {
  const { activeOrgId } = useSession();
  const open = useBuySeatsModalStore((s) => s.open);
  const context = useBuySeatsModalStore((s) => s.context);
  const close = useBuySeatsModalStore((s) => s.close);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-sm" />
        <Dialog.Content
          role="dialog"
          aria-labelledby="buy-seats-title"
          aria-describedby="buy-seats-desc"
          data-testid="buy-seats-modal"
          className="fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-3)] focus:outline-none"
        >
          {open && activeOrgId ? (
            <BuySeatsModalBody
              orgId={activeOrgId}
              context={context}
              onClose={close}
            />
          ) : open ? (
            <Stack gap="3">
              <ModalHeader title="Buy seats" onClose={close} />
              <p className="text-sm text-[var(--text-muted)]">
                Pick a workspace first to buy seats.
              </p>
              <Cluster justify="end">
                <Button variant="ghost" onClick={close}>Close</Button>
              </Cluster>
            </Stack>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function BuySeatsModalBody({
  orgId,
  context,
  onClose,
}: {
  orgId: string;
  context: BuySeatsModalContext | null;
  onClose: () => void;
}) {
  const [seats, setSeats] = useState<SeatsOut | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("alacarte");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    api.billing.getSeats(orgId)
      .then((data) => { if (!cancelled) setSeats(data); })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.message : "Couldn't load seat info.");
      });
    return () => { cancelled = true; };
  }, [orgId]);

  const headline = context?.headlineOverride
    ?? (context?.inviteeEmail
      ? `Onboard ${context.inviteeEmail}`
      : "Grow your team");

  if (loadError) {
    return (
      <Stack gap="3">
        <ModalHeader title={headline} onClose={onClose} />
        <p className="text-sm text-[var(--danger)]" role="alert">{loadError}</p>
      </Stack>
    );
  }

  if (!seats) {
    return (
      <Stack gap="3">
        <ModalHeader title={headline} onClose={onClose} />
        <div className="h-24 w-full animate-pulse rounded-md bg-[var(--surface-2)]" />
      </Stack>
    );
  }

  const showUpgradeTab = seats.tier === "solo" && seats.pro_upgrade_quote !== null;
  const activeTab: TabKey = showUpgradeTab ? tab : "alacarte";

  // The tabs open Razorpay Checkout.js inline and only call back once the
  // payment is verified; the webhook applies the seat increment / upgrade,
  // so we just confirm + close here.
  const handleBuySuccess = (requestedSeats: number) => {
    toast.success(
      `Payment received — ${requestedSeats} seat${requestedSeats > 1 ? "s" : ""} will be added shortly.`,
    );
    onClose();
  };

  const handleUpgradeSuccess = () => {
    toast.success("Payment received — your workspace is upgrading to Pro.");
    onClose();
  };

  return (
    <Stack gap="4">
      <ModalHeader title={headline} onClose={onClose} />
      {showUpgradeTab && <TabStrip active={activeTab} onChange={setTab} />}
      {activeTab === "alacarte" ? (
        <BuySeatsAlaCarteTab
          orgId={orgId}
          seats={seats}
          defaultCount={context?.defaultCount ?? 1}
          onError={setSubmitError}
          onSuccess={handleBuySuccess}
        />
      ) : (
        <BuySeatsUpgradeTab
          orgId={orgId}
          seats={seats}
          quote={seats.pro_upgrade_quote!}
          onError={setSubmitError}
          onSuccess={handleUpgradeSuccess}
        />
      )}
      {submitError && (
        <p
          className="text-sm text-[var(--danger)]"
          data-testid="buy-seats-error"
          role="alert"
        >
          {submitError}
        </p>
      )}
    </Stack>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <>
      <Cluster justify="between" align="center">
        <Dialog.Title
          id="buy-seats-title"
          className="text-lg font-semibold"
          data-testid="buy-seats-headline"
        >
          {title}
        </Dialog.Title>
        <Dialog.Close
          aria-label="Close"
          onClick={onClose}
          className="text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <X className="size-4" />
        </Dialog.Close>
      </Cluster>
      <Dialog.Description id="buy-seats-desc" className="sr-only">
        Buy additional seats or upgrade to Pro.
      </Dialog.Description>
    </>
  );
}

const TABS: Array<{ key: TabKey; label: string; Icon: typeof UserPlus }> = [
  { key: "alacarte", label: "Add seats à la carte", Icon: UserPlus },
  { key: "upgrade", label: "Upgrade to Pro", Icon: Sparkles },
];

function TabStrip({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Buy seats options"
      className="flex gap-1 border-b border-[var(--border)]"
    >
      {TABS.map(({ key, label, Icon }) => {
        const selected = key === active;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`buy-seats-tab-${key}`}
            onClick={() => onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
              selected
                ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
