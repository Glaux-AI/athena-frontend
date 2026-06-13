"use client";

/**
 * Buy-seats modal store - §7.9.9.
 *
 * Singleton Zustand store so any callsite (SeatsCard CTA, AwaitingSeatPill,
 * over-cap invite toast action, seats-full CTA on the members page) can
 * open the modal without prop-drilling. The modal itself is mounted once
 * in AppShell and subscribes to this store.
 *
 * `context` carries the contextual headline / default-count knobs the
 * `openWithContext({...})` overload populates. `null` means "no context"
 * → modal renders default copy.
 */

import { create } from "zustand";

export interface BuySeatsModalContext {
  inviteeEmail?: string;
  defaultCount?: number;
  headlineOverride?: string;
}

interface BuySeatsModalState {
  open: boolean;
  context: BuySeatsModalContext | null;
  openModal: () => void;
  openWithContext: (ctx: BuySeatsModalContext) => void;
  close: () => void;
}

export const useBuySeatsModalStore = create<BuySeatsModalState>((set) => ({
  open: false,
  context: null,
  openModal: () => set({ open: true, context: null }),
  openWithContext: (ctx) => set({ open: true, context: ctx }),
  close: () => set({ open: false, context: null }),
}));

/**
 * Hook returned to callers - mirrors the shape from the readiness spec
 * (`{open, close, openWithContext}`). `open()` is the no-context overload;
 * `openWithContext({...})` is the contextual variant.
 */
export function useBuySeatsModal(): {
  open: () => void;
  close: () => void;
  openWithContext: (ctx: BuySeatsModalContext) => void;
} {
  const openModal = useBuySeatsModalStore((s) => s.openModal);
  const close = useBuySeatsModalStore((s) => s.close);
  const openWithContext = useBuySeatsModalStore((s) => s.openWithContext);
  return { open: openModal, close, openWithContext };
}
