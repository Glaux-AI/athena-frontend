"use client";

/**
 * Select - the token-styled select (Nightglass §5.4). Wraps the native
 * <select> (keyboard/AT/mobile behavior for free) in the shared field chrome:
 * hairline border, custom chevron, and the accent-glow focus every text field
 * shares. Replaces the bare OS-default selects that used to sit mid-surface.
 */

import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { inputFocus } from "./focus";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "sm" | "md";
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = "md", children, ...props }, ref) => (
    <span className={cn("relative inline-flex", className)}>
      <select
        ref={ref}
        className={cn(
          "w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]",
          "transition-[border-color,box-shadow] duration-150",
          "disabled:cursor-not-allowed disabled:opacity-55",
          inputFocus,
          size === "sm" ? "h-8 pl-2.5 pr-7 text-xs" : "h-9 pl-3 pr-8 text-sm",
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-subtle)]",
          size === "sm" ? "right-2 size-3.5" : "right-2.5 size-4",
        )}
        aria-hidden
      />
    </span>
  ),
);
Select.displayName = "Select";
