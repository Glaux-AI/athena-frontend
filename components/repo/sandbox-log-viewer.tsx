"use client";

/**
 * SandboxLogViewer - a tail-following terminal log pane (ADR-086-A).
 *
 * Shows the streamed output of sandbox operations (install, build, test, shell)
 * so the user can see exactly what ran - the feature must never be a black box.
 * Auto-scrolls to the tail while new lines arrive unless the user scrolls up.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Terminal } from "lucide-react";

import { cn } from "@/lib/cn";

export function SandboxLogViewer({
  text,
  streaming = false,
  className,
}: {
  text: string;
  streaming?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [stick, setStick] = useState(true);

  useLayoutEffect(() => {
    if (stick && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, stick]);

  // When the user scrolls away from the bottom, stop auto-following.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      setStick(atBottom);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={cn("overflow-hidden rounded-lg border border-[var(--border)]", className)}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-micro text-[var(--text-muted)]">
        <Terminal className="h-3.5 w-3.5" aria-hidden />
        <span className="font-medium">Sandbox output</span>
        {streaming && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="star-dot is-live" style={{ "--dot-color": "var(--success)" } as CSSProperties} aria-hidden />
            live
          </span>
        )}
      </div>
      <pre
        ref={ref}
        className="max-h-72 overflow-auto bg-[var(--surface)] px-3 py-2 font-mono text-micro leading-relaxed text-[var(--text)]"
      >
        {text.trim() || (streaming ? "Waiting for output..." : "No output yet.")}
      </pre>
    </div>
  );
}
