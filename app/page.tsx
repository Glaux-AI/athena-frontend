/**
 * Logged-out landing. Minimal — Athena is enterprise-sold, not consumer-funneled.
 * In M0, just enough to let an internal user click "Sign in" and reach the
 * dashboard.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Sophia } from "@/components/mascot/sophia";
import { Center, Stack } from "@/components/layout/primitives";

export default function LandingPage() {
  return (
    <Center as="main">
      <Stack gap="6" className="text-center">
        <div className="mx-auto">
          <Sophia size={64} />
        </div>
        <Stack gap="2">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Athena</h1>
          <p className="text-base text-[var(--text-muted)]">
            From a written idea to a reviewed pull request.
          </p>
        </Stack>
        <div className="flex items-center justify-center gap-2">
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">Get a demo</Link>
          </Button>
        </div>
      </Stack>
    </Center>
  );
}
