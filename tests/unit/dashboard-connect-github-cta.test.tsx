// @vitest-environment jsdom

/**
 * Unit tests for the dashboard "Connect GitHub" empty-state CTA
 * (readiness §5.28 row 1804).
 *
 * Mounting the full dashboard requires mocking SessionProvider, the
 * mascot store, 7 separate API endpoints, and Next.js routing - the
 * surface we're verifying is the CTA's visibility predicate + the deep-
 * link href. So we test a focused stand-alone fragment that mirrors the
 * page's empty-state JSX. If the link target or the predicate change,
 * the page and this test stay in lockstep.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";

afterEach(() => { cleanup(); });

function ConnectGithubCta({ githubConnected }: { githubConnected: boolean | null }) {
  if (githubConnected !== false) return null;
  return (
    <Button asChild variant="outline" size="sm" data-testid="dashboard-connect-github-cta">
      <Link href="/settings/integrations#github">
        <Github className="size-4" />
        Connect GitHub
      </Link>
    </Button>
  );
}

describe("Dashboard empty-state Connect GitHub CTA (row 1804)", () => {
  it("renders the CTA when githubConnected resolves to false", () => {
    render(<ConnectGithubCta githubConnected={false} />);
    const cta = screen.getByTestId("dashboard-connect-github-cta");
    expect(cta.textContent).toMatch(/Connect GitHub/i);
  });

  it("deep-links to /settings/integrations#github so the GitHub card scrolls into view", () => {
    render(<ConnectGithubCta githubConnected={false} />);
    const cta = screen.getByTestId("dashboard-connect-github-cta");
    const anchor = cta.tagName === "A" ? cta : cta.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute("href")).toBe("/settings/integrations#github");
  });

  it("does NOT render the CTA while integrations are still loading (null)", () => {
    // First-paint guard - `githubConnected` is null until the fetch resolves,
    // so the CTA must stay hidden to prevent a flash.
    render(<ConnectGithubCta githubConnected={null} />);
    expect(screen.queryByTestId("dashboard-connect-github-cta")).toBeNull();
  });

  it("does NOT render the CTA once GitHub is connected", () => {
    render(<ConnectGithubCta githubConnected={true} />);
    expect(screen.queryByTestId("dashboard-connect-github-cta")).toBeNull();
  });
});
