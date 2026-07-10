"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Tooltip - a frosted instrument (.glass-panel) on the sanctioned tooltip
 * layer (--z-tooltip). Opens after a short delay so pointer sweeps across
 * dense rows don't flicker; focus shows it immediately.
 */
export function Tooltip({
  content,
  children,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const show = (delay: number) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  return (
    <span
      className={cn("relative inline-block", className)}
      onMouseEnter={() => show(150)}
      onMouseLeave={hide}
    >
      <span
        tabIndex={0}
        onFocus={() => show(0)}
        onBlur={hide}
        className="outline-none"
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          className="glass-panel animate-pop-in absolute left-0 top-full z-[var(--z-tooltip)] mt-1.5 w-max max-w-sm p-2.5 text-left text-xs whitespace-normal"
        >
          {content}
        </span>
      )}
    </span>
  );
}
