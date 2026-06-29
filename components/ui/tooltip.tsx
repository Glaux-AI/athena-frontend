"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

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

  return (
    <span
      className={cn("relative inline-block", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="outline-none"
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          className={cn(
            "glass absolute left-0 top-full z-[100] mt-1 w-max max-w-sm rounded-xl p-3 text-xs shadow-[var(--shadow-3)] text-left whitespace-normal",
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
