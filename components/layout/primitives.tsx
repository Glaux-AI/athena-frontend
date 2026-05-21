/**
 * The five layout primitives mandated by UX design standard §5.
 * Use these instead of bespoke flex/grid per screen.
 */

import { cn } from "@/lib/cn";
import { type ReactNode } from "react";

type Gap = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "8" | "12" | "16";
const GAP_MAP: Record<Gap, string> = {
  "0": "gap-0", "1": "gap-1", "2": "gap-2", "3": "gap-3", "4": "gap-4",
  "5": "gap-5", "6": "gap-6", "8": "gap-8", "12": "gap-12", "16": "gap-16",
};

// -------- Stack -- vertical rhythm --------------------------------------------
export function Stack({
  children,
  gap = "4",
  className,
  as: As = "div",
}: {
  children: ReactNode;
  gap?: Gap;
  className?: string;
  as?: "div" | "section" | "article" | "ul" | "ol";
}) {
  return <As className={cn("flex flex-col", GAP_MAP[gap], className)}>{children}</As>;
}

// -------- Cluster -- horizontal, wraps ----------------------------------------
export function Cluster({
  children,
  gap = "2",
  align = "center",
  justify = "start",
  className,
  as: As = "div",
}: {
  children: ReactNode;
  gap?: Gap;
  align?: "start" | "center" | "end" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around";
  className?: string;
  as?: "div" | "nav" | "header" | "footer";
}) {
  return (
    <As
      className={cn(
        "flex flex-wrap",
        GAP_MAP[gap],
        `items-${align}`,
        `justify-${justify}`,
        className
      )}
    >
      {children}
    </As>
  );
}

// -------- Sidebar -- fixed-width nav + flexible main --------------------------
export function Sidebar({
  side,
  main,
  sideWidth = "240px",
  className,
}: {
  side: ReactNode;
  main: ReactNode;
  sideWidth?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex w-full min-h-0 flex-1", className)}>
      <aside
        className="border-r bg-[var(--surface)] shrink-0"
        style={{ width: sideWidth, borderColor: "var(--border)" }}
      >
        {side}
      </aside>
      <main className="flex-1 min-w-0 bg-[var(--bg)] overflow-auto">{main}</main>
    </div>
  );
}

// -------- Grid -- explicit columns --------------------------------------------
export function Grid({
  children,
  cols = "1",
  gap = "4",
  className,
}: {
  children: ReactNode;
  cols?: "1" | "2" | "3" | "4" | "auto-fit-280" | "auto-fit-320";
  gap?: Gap;
  className?: string;
}) {
  if (cols === "auto-fit-280" || cols === "auto-fit-320") {
    const min = cols === "auto-fit-280" ? "280px" : "320px";
    return (
      <div
        className={cn("grid", GAP_MAP[gap], className)}
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }}
      >
        {children}
      </div>
    );
  }
  const colsMap = { "1": "grid-cols-1", "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" } as const;
  return <div className={cn("grid", colsMap[cols], GAP_MAP[gap], className)}>{children}</div>;
}

// -------- Center -- centered viewport (empty states, login, errors) ----------
export function Center({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "main" | "section";
}) {
  return (
    <As className={cn("flex min-h-full w-full flex-1 items-center justify-center p-8", className)}>
      <div className="w-full max-w-md">{children}</div>
    </As>
  );
}
