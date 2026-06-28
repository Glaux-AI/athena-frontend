"use client";

/**
 * Owns the design-prototype iframe and the postMessage protocol with the
 * injected bridge: the layers tree, the picked element, applying token-valued
 * style edits (Tier-1, no LLM), and serializing the edited document for save.
 * Only messages from THIS iframe's contentWindow are trusted (the sandbox
 * origin is the opaque "null", so source identity is the fence).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import type { BridgeCommand, BridgeInbound, DesignNode, PickedNode } from "./editor-bridge";

/** Omit that distributes over the BridgeCommand union so each variant keeps its
 *  own keys (a plain Omit on a union collapses to the shared keys only). */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface DesignCanvas {
  iframeRef: RefObject<HTMLIFrameElement>;
  tree: DesignNode[];
  picked: PickedNode | null;
  dirty: boolean;
  ready: boolean;
  select: (id: string) => void;
  apply: (id: string, prop: string, value: string, token: string | null) => void;
  serialize: () => Promise<string>;
  clearPicked: () => void;
  reset: () => void;
}

export function useDesignCanvas(code: string, armed: boolean): DesignCanvas {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [tree, setTree] = useState<DesignNode[]>([]);
  const [picked, setPicked] = useState<PickedNode | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ready, setReady] = useState(false);
  const serializeResolver = useRef<((html: string) => void) | null>(null);

  const send = useCallback((cmd: DistributiveOmit<BridgeCommand, "dir">) => {
    iframeRef.current?.contentWindow?.postMessage({ dir: "athena-studio", ...cmd }, "*");
  }, []);

  const reset = useCallback(() => {
    setTree([]);
    setPicked(null);
    setDirty(false);
    setReady(false);
  }, []);

  // A fresh prototype body (new version landed) starts a clean canvas.
  useEffect(() => {
    reset();
  }, [code, reset]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const d = e.data as BridgeInbound | undefined;
      if (!d || d.source !== "athena-studio") return;
      if (d.type === "ready") {
        setTree(d.tree);
        setReady(true);
      } else if (d.type === "pick") {
        setPicked(d.node);
      } else if (d.type === "serialized") {
        serializeResolver.current?.(d.html);
        serializeResolver.current = null;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Arm/disarm element picking when edit mode toggles (once the bridge is up).
  useEffect(() => {
    if (ready) send(armed ? { type: "arm" } : { type: "disarm" });
  }, [armed, ready, send]);

  const select = useCallback((id: string) => send({ type: "select", id }), [send]);

  const apply = useCallback(
    (id: string, prop: string, value: string, token: string | null) => {
      send({ type: "apply", id, prop, value, token });
      setDirty(true);
    },
    [send],
  );

  const serialize = useCallback(
    () =>
      new Promise<string>((resolve) => {
        serializeResolver.current = resolve;
        send({ type: "serialize" });
        // Safety net so a dropped message never hangs the Save button.
        window.setTimeout(() => {
          if (serializeResolver.current) {
            serializeResolver.current = null;
            resolve("");
          }
        }, 4000);
      }),
    [send],
  );

  const clearPicked = useCallback(() => setPicked(null), []);

  return { iframeRef, tree, picked, dirty, ready, select, apply, serialize, clearPicked, reset };
}
