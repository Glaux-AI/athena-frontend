import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - Athena",
  description: "How Athena collects, uses, retains, and deletes personal data.",
};

/** Version tag recorded against consent rows. Must match the backend's
 *  `settings.privacy_version` - bump both together. */
const PRIVACY_VERSION = "2026-07-01";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold">{children}</h2>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">{children}</p>;
}

function LI({ children }: { children: React.ReactNode }) {
  return <li className="mt-1.5 text-sm leading-6 text-[var(--text-muted)]">{children}</li>;
}

export default function PrivacyPolicyPage() {
  return (
    <article>
      <header className="relative overflow-hidden rounded-xl py-8">
        <div className="starfield opacity-60" aria-hidden />
        <h1 className="relative text-2xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="relative mt-1 text-xs text-[var(--text-subtle)]">
          Version {PRIVACY_VERSION}. Applies to tryathena.dev and the Athena API.
        </p>
      </header>

      <P>
        Athena is an engineering-knowledge and product-development platform. This
        policy explains what personal data we process, why, how long we keep it,
        and the rights you can exercise directly inside the product. For customer
        workspaces, the workspace owner is the data controller and Athena acts as
        a processor on their documented instructions.
      </P>

      <H2>What we collect</H2>
      <ul className="mt-2 list-disc pl-5">
        <LI>
          <strong className="text-[var(--text)]">Account data.</strong> Email address, display
          name, avatar, and the sign-in method you chose (GitHub, Google, or email
          code). We never store a password.
        </LI>
        <LI>
          <strong className="text-[var(--text)]">Workspace content.</strong> Repositories,
          documents, tasks, chat conversations, and files your organization
          connects or uploads. This content is isolated per workspace and
          encrypted at rest.
        </LI>
        <LI>
          <strong className="text-[var(--text)]">Usage and security records.</strong> A
          tamper-evident audit log of actions (who did what, when, from which IP
          and browser), request logs, and AI-usage metering (token counts and
          cost). Audit records are retained for compliance and cannot be edited.
        </LI>
      </ul>

      <H2>How we use it</H2>
      <P>
        To operate the service: authenticate you, answer questions grounded in
        your workspace knowledge, run the agent workflows you start, send
        transactional email (invitations, notifications you opted into), meter
        usage, and keep the platform secure. We do not sell personal data and we
        do not run third-party advertising or analytics trackers.
      </P>

      <H2>AI processing</H2>
      <P>
        Prompts assembled from your workspace content are sent to the model
        providers your organization configures (see the{" "}
        <Link href="/legal/subprocessors" className="text-[var(--primary)] underline-offset-4 hover:underline">
          sub-processor list
        </Link>
        ). A data-loss-prevention filter scrubs recognized secrets and sensitive
        patterns from outbound prompts, and per-workspace redaction rules apply
        to logs and audit records. Organizations can bring their own provider
        keys, restrict model routing, or disable AI models entirely from
        workspace settings.
      </P>

      <H2>Cookies and local storage</H2>
      <P>
        We use only strictly necessary cookies: the authentication session issued
        at sign-in. There are no advertising, analytics, or cross-site tracking
        cookies, which is why the app shows no cookie banner. The browser keeps a
        small amount of non-personal UI state (such as your active workspace id)
        in local storage.
      </P>

      <H2>Retention and deletion</H2>
      <ul className="mt-2 list-disc pl-5">
        <LI>
          Workspace admins configure retention windows for chat history, task
          artifacts, and notifications; a nightly job deletes data past the
          window.
        </LI>
        <LI>
          Deleting a workspace is two-stage: a 30-day recoverable soft delete,
          then a permanent purge of database rows and stored files.
        </LI>
        <LI>
          Deleting your account (Settings, then Profile) locks it immediately and
          permanently erases your personal data, uploaded files, and sign-in
          identity after a 30-day grace window. Audit-log entries retain only a
          pseudonymous identifier, kept to satisfy legal and security
          obligations.
        </LI>
      </ul>

      <H2>Your rights</H2>
      <P>
        Wherever you are, we extend GDPR-style rights to every user, exercisable
        in-product without a support ticket:
      </P>
      <ul className="mt-2 list-disc pl-5">
        <LI><strong className="text-[var(--text)]">Access and portability</strong> - download a machine-readable export of your data from Settings, then Profile.</LI>
        <LI><strong className="text-[var(--text)]">Rectification</strong> - edit your display name and avatar from the same page.</LI>
        <LI><strong className="text-[var(--text)]">Erasure</strong> - delete your account from the same page.</LI>
        <LI><strong className="text-[var(--text)]">Withdrawal of consent</strong> - notification preferences are per-channel opt-outs; integrations and AI features can be disconnected by workspace admins at any time.</LI>
      </ul>
      <P>
        For anything not covered by the self-service tools, or to raise a
        complaint, contact{" "}
        <a href="mailto:noreply@tryathena.dev" className="text-[var(--primary)] underline-offset-4 hover:underline">
          noreply@tryathena.dev
        </a>
        . You may also lodge a complaint with your local supervisory authority.
      </P>

      <H2>Security</H2>
      <P>
        Secrets and integration tokens are encrypted with AES-256-GCM envelope
        encryption. Every workspace is isolated with row-level security plus
        explicit per-query tenancy checks. All traffic is TLS. State changes are
        recorded in an append-only, hash-chained audit log whose integrity can be
        verified on demand.
      </P>

      <H2>Sub-processors and transfers</H2>
      <P>
        The current list of third parties that may process customer data, what
        they receive, and where they run is published at{" "}
        <Link href="/legal/subprocessors" className="text-[var(--primary)] underline-offset-4 hover:underline">
          /legal/subprocessors
        </Link>{" "}
        and served by the API at <code className="text-xs">/v1/legal/subprocessors</code>.
        Where data leaves your region we rely on the providers&apos; standard
        contractual clauses.
      </P>

      <H2>Changes</H2>
      <P>
        When this policy changes materially we bump the version above and ask you
        to re-accept it on your next sign-in. Your acceptance history is
        included in your data export.
      </P>
    </article>
  );
}
