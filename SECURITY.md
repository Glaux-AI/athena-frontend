# Security policy

## Supported versions

We support the latest released `main` branch. Older versions are not
backported.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security reports.**

Email **`security@athena.dev`** with:

- A clear description of the issue and its impact.
- Steps to reproduce (proof-of-concept welcomed; please do not run against
  production environments other than your own).
- Any relevant logs, request/response samples, or stack traces — with
  customer data, secrets, and PII redacted.

We acknowledge receipt within **2 business days** and aim to provide an
initial assessment within **5 business days**. Critical issues are
prioritised over feature work.

We follow a coordinated disclosure model. Please give us reasonable time to
investigate and remediate before publishing details. We're happy to
credit reporters in release notes if you'd like.

## Scope

In scope for this repository:

- The Next.js web application code in this repository.
- The build, packaging, and dependency surface.

Out of scope:

- The Athena API server (operated separately).
- Third-party services the API server may call.
- Issues that require physical access, social engineering, or compromised
  user accounts.
- Denial-of-service tests that affect other users.

## What is not a vulnerability

- Outdated dependencies that have no known CVE — please open a normal
  issue or PR for upgrades.
- Missing CSP directives that aren't exploitable in our deployment model.
- "Best-practice" hardening suggestions that are not tied to a concrete
  attack — please file a normal issue.

## Hardening guarantees we publish

- **No secrets in this repository.** All `NEXT_PUBLIC_*` env vars are
  bundled into the browser and treated as public.
- **No backend in this repository.** The API server lives in a separate,
  private repository.
- **Strict CSP** applied in production builds via `next.config.mjs`.
- **No `localStorage` writes** of customer data.
- **No third-party tracking scripts** ship by default.
- **`HSTS`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (camera /
  microphone / geolocation / payment / interest-cohort denied),
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Resource-Policy: same-origin`** set on every response.
- **No `'unsafe-eval'`** in the CSP. `'unsafe-inline'` is only on
  `style-src` (required by Tailwind v4's inline critical CSS).
- **Server source maps are not shipped to the browser** in production
  builds (`productionBrowserSourceMaps: false`).
- **`X-Powered-By` header removed.**

## Dependency policy

- Renovate is enabled (or expected to be enabled) on the repository.
- Trivy / Snyk-style scans are expected as part of CI on every PR.
- Critical CVEs are addressed within 7 days; high within 30 days.

## Contact

`security@athena.dev` is the only address accepted for security reports.
