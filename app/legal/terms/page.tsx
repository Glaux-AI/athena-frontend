import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Athena",
  description: "The agreement governing use of Athena.",
};

/** Version tag recorded against consent rows. Must match the backend's
 *  `settings.terms_version` - bump both together. */
const TERMS_VERSION = "2026-07-01";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{children}</p>;
}

export default function TermsPage() {
  return (
    <article>
      <h1 className="text-2xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-1 text-xs text-[var(--text-subtle)]">
        Version {TERMS_VERSION}. Applies to tryathena.dev and the Athena API.
      </p>

      <P>
        These terms are an agreement between you (or the organization you
        represent) and Athena. By creating an account or using the service you
        accept them. If you accept on behalf of an organization, you confirm you
        have authority to bind it.
      </P>

      <H2>The service</H2>
      <P>
        Athena builds a knowledge base from the repositories, documents, and
        tools your organization connects, and runs AI agents over that knowledge
        to answer questions and carry out product-development work you initiate.
        The service is in beta: features may change, and availability is
        provided on a best-effort basis without an uptime guarantee.
      </P>

      <H2>Your account</H2>
      <P>
        Sign-in is passwordless via GitHub, Google, or a one-time email code.
        One email maps to exactly one sign-in method. You are responsible for
        activity under your account and for keeping your sign-in provider
        secure. Workspace owners control membership, roles, and permissions for
        their workspace.
      </P>

      <H2>Your content</H2>
      <P>
        You retain all rights to the code, documents, and data you or your
        organization bring to Athena. You grant us the limited rights needed to
        operate the service: to store, index, and process that content, and to
        send prompts derived from it to the AI providers your workspace
        configures. We claim no ownership of AI outputs generated for you; you
        are responsible for reviewing them before relying on them. Every code
        change an Athena agent produces requires your explicit approval before
        it reaches your repositories.
      </P>

      <H2>Acceptable use</H2>
      <P>
        Do not use Athena to violate law, infringe others&apos; rights, probe or
        disrupt the service or other tenants, resell access without an
        agreement, or connect content you have no right to process. We may
        suspend accounts that put the platform or other customers at risk.
      </P>

      <H2>Billing</H2>
      <P>
        Paid plans are billed through Razorpay in advance. AI usage draws down
        workspace credits; owners can set spend caps and kill switches. Fees are
        non-refundable except where required by law. We may change pricing with
        notice effective from your next billing period.
      </P>

      <H2>Privacy and data protection</H2>
      <P>
        Our{" "}
        <Link href="/legal/privacy" className="text-[var(--primary)] underline-offset-4 hover:underline">
          Privacy Policy
        </Link>{" "}
        describes what we process and the rights you can exercise in-product,
        including full data export and account erasure. For customer workspaces
        we act as a processor; a data-processing agreement is available on
        request.
      </P>

      <H2>Disclaimers and liability</H2>
      <P>
        The service is provided as-is during beta. To the maximum extent
        permitted by law, we disclaim implied warranties and our aggregate
        liability for claims arising out of the service is limited to the
        amounts you paid us in the twelve months before the claim. Nothing in
        these terms limits liability that cannot be limited by law.
      </P>

      <H2>Termination</H2>
      <P>
        You can stop using Athena at any time: workspace owners can delete their
        workspace and any user can delete their account, both from settings,
        with permanent data deletion after a 30-day recovery window. We may
        terminate for material breach with notice.
      </P>

      <H2>Changes</H2>
      <P>
        When these terms change materially we bump the version above and ask you
        to re-accept them on your next sign-in. Continued use after acceptance
        constitutes agreement.
      </P>
    </article>
  );
}
