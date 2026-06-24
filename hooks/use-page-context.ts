"use client";

/**
 * usePageContext - what the in-app chat FAB tells Athena about the page the
 * user is asking from.
 *
 * Two parts: a cheap, route-derived `label` for the panel header chip, and a
 * `capture()` that reads the LIVE DOM at send time and builds the
 * agent-facing `page_context` string. Capturing at send (not render) means the
 * snapshot reflects whatever is on screen right then - current tab, expanded
 * sections, freshly-loaded data.
 *
 * The text comes from the page's main-content container (`[data-page-content]`,
 * set on the AppShell main wrapper). `innerText` returns the element's whole
 * subtree - including rows scrolled out of view and text a CSS line-clamp only
 * visually truncates - so the agent sees the full page, not just the viewport.
 * Content that is genuinely not in the DOM (an unopened accordion) can't be
 * captured. The string rides the turn transiently and is never persisted
 * server-side (see `streamChatMessage` / the BE `page_context` field).
 */

import { useCallback } from "react";
import { usePathname } from "next/navigation";

/** Chars of page text we ship. Kept under the BE's `page_context` cap (16k)
 *  so the server never has to reject the turn for an over-long snapshot. */
const MAX_PAGE_TEXT = 14_000;

export interface PageContextSnapshot {
  /** Compact, route-derived label for the panel header chip. */
  label: string;
  /** Read the live page and build the agent-facing context string, or null
   *  when there is nothing meaningful to send. */
  capture: () => string | null;
}

export interface RouteInfo {
  label: string;
  entityKind: string | null;
  entityId: string | null;
}

const TOP_LABELS: Record<string, string> = {
  dashboard: "Home",
  chat: "Chat",
  inbox: "Inbox",
  activity: "Activity",
  "my-work": "My Work",
  work: "Tasks",
  domains: "Domains",
  knowledge: "Organization Knowledge",
  "blueprint-proposals": "Blueprint Approvals",
  rules: "Decision Records",
  skills: "Skills",
  mcp: "MCP Servers",
  cost: "Cost Analytics",
  settings: "Settings",
  runs: "Run History",
  local: "Local Workspaces",
};

/** Pure route -> {label, entity} mapper. No DOM, no hooks - unit-testable.
 *  The deepest dynamic segment wins (a repo page is a repo, not its domain). */
export function describeRoute(pathname: string): RouteInfo {
  const parts = pathname.split("/").filter(Boolean);
  const seg = (i: number): string => parts[i] ?? "";
  const id = (i: number): string | null => {
    const raw = parts[i];
    return raw ? decodeURIComponent(raw) : null;
  };

  if (seg(0) === "domains" && seg(2) === "repos" && parts[3]) {
    return { label: "Repository", entityKind: "repo", entityId: id(3) };
  }
  if (seg(0) === "domains" && parts[1]) {
    return { label: "Domain", entityKind: "domain", entityId: id(1) };
  }
  if (seg(0) === "work" && parts[1]) {
    return { label: "Task", entityKind: "task", entityId: id(1) };
  }
  if (seg(0) === "mcp" && parts[1]) {
    return { label: "MCP server", entityKind: "mcp", entityId: id(1) };
  }
  if (seg(0) === "decisions" && parts[1]) {
    return { label: "Decision", entityKind: "decision", entityId: id(1) };
  }
  if (seg(0) === "skills" && parts[1]) {
    return { label: "Skill", entityKind: "skill", entityId: id(1) };
  }
  return { label: TOP_LABELS[seg(0)] ?? "Athena", entityKind: null, entityId: null };
}

/** Tidy a raw `innerText` dump: collapse runs of spaces/blank lines so the
 *  snapshot stays dense without losing structure. */
export function tidyPageText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readMainText(): string {
  if (typeof document === "undefined") return "";
  const root =
    document.querySelector<HTMLElement>("[data-page-content]") ??
    document.querySelector<HTMLElement>("main") ??
    document.body;
  return tidyPageText(root?.innerText ?? "");
}

function readHeading(): string | null {
  if (typeof document === "undefined") return null;
  const scope =
    document.querySelector<HTMLElement>("[data-page-content]") ??
    document.body;
  const text = scope?.querySelector<HTMLElement>("h1")?.innerText?.trim();
  return text && text.length > 0 && text.length <= 140 ? text : null;
}

/** Build the page_context string from a route + the live DOM. Exported so the
 *  capture logic can be unit-tested without a real `usePathname`. */
export function buildPageContext(
  pathname: string,
  search: string,
  heading: string | null,
  text: string,
): string | null {
  const route = describeRoute(pathname);
  const lines: string[] = [
    `Page: ${heading ?? route.label} (route ${pathname}${search})`,
  ];
  if (route.entityKind && route.entityId) {
    lines.push(`This page is showing ${route.entityKind} \`${route.entityId}\`.`);
  }
  const tidy = tidyPageText(text);
  if (tidy) {
    let body = tidy;
    let truncated = false;
    if (body.length > MAX_PAGE_TEXT) {
      body = body.slice(0, MAX_PAGE_TEXT);
      truncated = true;
    }
    lines.push(
      "",
      "Text currently rendered on this page (includes content scrolled out of view):",
      body,
    );
    if (truncated) lines.push("[...page text truncated...]");
  }
  const out = lines.join("\n").trim();
  return out.length > 0 ? out : null;
}

export function usePageContext(): PageContextSnapshot {
  const pathname = usePathname() ?? "/";
  const label = describeRoute(pathname).label;

  const capture = useCallback((): string | null => {
    if (typeof window === "undefined") return null;
    return buildPageContext(
      pathname,
      window.location.search || "",
      readHeading(),
      readMainText(),
    );
  }, [pathname]);

  return { label, capture };
}
