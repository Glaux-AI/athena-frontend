"use client";

/**
 * Switch - the one toggle primitive (Nightglass §5.4). Replaces the
 * hand-rolled role="switch" tracks that drifted per page. The checked thumb
 * carries a faint accent halo - status controls as tiny identity moments.
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";
import { focusRing } from "./focus";

interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  size?: "sm" | "md";
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, size = "md", className, disabled, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex flex-none items-center rounded-full transition-colors duration-150",
        focusRing,
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-4 w-7 p-0.5" : "h-5 w-9 p-0.5",
        checked ? "bg-[var(--primary)]" : "bg-[var(--surface-3)]",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "block rounded-full bg-[var(--surface)] transition-transform duration-150",
          size === "sm" ? "size-3" : "size-4",
          checked &&
            (size === "sm" ? "translate-x-3" : "translate-x-4"),
          checked && "shadow-[0_0_6px_1px_var(--glow-accent)]",
        )}
      />
    </button>
  ),
);
Switch.displayName = "Switch";
