/**
 * The five layout primitives mandated by UX design standard §5.
 * Use these instead of bespoke flex/grid per screen.
 */

import { cn } from "@/lib/cn";
import { type ReactNode } from "react";

type Gap =
  | "0"
  | "0.5"
  | "1"
  | "1.5"
  | "2"
  | "2.5"
  | "3"
  | "3.5"
  | "4"
  | "5"
  | "6"
  | "8"
  | "10"
  | "12"
  | "16";
const GAP_MAP: Record<Gap, string> = {
  "0": "gap-0",
  "0.5": "gap-0.5",
  "1": "gap-1",
  "1.5": "gap-1.5",
  "2": "gap-2",
  "2.5": "gap-2.5",
  "3": "gap-3",
  "3.5": "gap-3.5",
  "4": "gap-4",
  "5": "gap-5",
  "6": "gap-6",
  "8": "gap-8",
  "10": "gap-10",
  "12": "gap-12",
  "16": "gap-16",
};

// -------- Stack -- vertical rhythm --------------------------------------------
export function Stack({
  children,
  gap = "4",
  className,
  as: As = "div",
  "data-testid": dataTestid,
}: {
  children: ReactNode;
  gap?: Gap;
  className?: string;
  as?: "div" | "section" | "article" | "ul" | "ol";
  "data-testid"?: string;
}) {
  return (
    <As
      className={cn("flex flex-col", GAP_MAP[gap], className)}
      data-testid={dataTestid}
    >
      {children}
    </As>
  );
}

// -------- Cluster -- horizontal, wraps ----------------------------------------
export function Cluster({
  children,
  gap = "2",
  align = "center",
  justify = "start",
  className,
  as: As = "div",
  "data-testid": dataTestid,
}: {
  children: ReactNode;
  gap?: Gap;
  align?: "start" | "center" | "end" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around";
  className?: string;
  as?: "div" | "nav" | "header" | "footer";
  "data-testid"?: string;
}) {
  return (
    <As
      className={cn(
        "flex flex-wrap",
        GAP_MAP[gap],
        `items-${align}`,
        `justify-${justify}`,
        className,
      )}
      data-testid={dataTestid}
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
  sideClassName,
}: {
  side: ReactNode;
  main: ReactNode;
  sideWidth?: string;
  className?: string;
  /** Extra classes on the <aside> - e.g. `hidden lg:block` to collapse it
   *  on small screens in favour of an off-canvas drawer. */
  sideClassName?: string;
}) {
  return (
    <div className={cn("flex w-full min-h-0 flex-1", className)}>
      <aside
        className={cn("border-r bg-[var(--surface)] shrink-0", sideClassName)}
        style={{ width: sideWidth, borderColor: "var(--border)" }}
      >
        {side}
      </aside>
      <main className="flex-1 min-w-0 bg-[var(--bg)] overflow-auto">
        {main}
      </main>
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
  cols?: "1" | "2" | "3" | "4" | `auto-fit-${number}`;
  gap?: Gap;
  className?: string;
}) {
  if (typeof cols === "string" && cols.startsWith("auto-fit-")) {
    const min = `${cols.slice("auto-fit-".length)}px`;
    return (
      <div
        className={cn("grid", GAP_MAP[gap], className)}
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))` }}
      >
        {children}
      </div>
    );
  }
  const colsMap: Record<"1" | "2" | "3" | "4", string> = {
    "1": "grid-cols-1",
    "2": "grid-cols-2",
    "3": "grid-cols-3",
    "4": "grid-cols-4",
  };
  return (
    <div
      className={cn(
        "grid",
        colsMap[cols as "1" | "2" | "3" | "4"],
        GAP_MAP[gap],
        className,
      )}
    >
      {children}
    </div>
  );
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
    <As
      className={cn(
        "flex min-h-full w-full flex-1 items-center justify-center p-8",
        className,
      )}
    >
      <div className="w-full max-w-md">{children}</div>
    </As>
  );
}
