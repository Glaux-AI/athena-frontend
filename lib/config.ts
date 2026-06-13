/**
 * Centralized runtime configuration. **The only place** `process.env.*` is
 * read in the app.
 *
 * Both values below are public (bundled into the browser). Never put a
 * secret in any NEXT_PUBLIC_* var.
 *
 * Fails closed in production if `NEXT_PUBLIC_API_URL` is missing or invalid -
 * we'd rather refuse to build than ship a frontend that silently sends
 * authenticated requests to the wrong origin.
 */

function readApiMode(): "live" | "mock" {
  const raw = process.env.NEXT_PUBLIC_API_MODE?.trim().toLowerCase();
  if (raw === "mock") return "mock";
  return "live";
}

function readApiUrl(): string {
  // In mock mode we never make a real network call, so apiUrl can be a
  // sentinel value. Keeps NEXT_PUBLIC_API_URL optional for demo/preview builds.
  if (readApiMode() === "mock") {
    return process.env.NEXT_PUBLIC_API_URL?.trim() || "http://mock.athena.local";
  }

  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      // Throw at module load - Next.js build will fail loudly.
      throw new Error(
        "NEXT_PUBLIC_API_URL is required in production. " +
          "Set it to the absolute URL of the Athena API server (e.g. https://api.example.com)."
      );
    }
    // Dev fallback only.
    return "http://localhost:8000";
  }

  // Validate the URL shape and protocol.
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_URL is not a valid URL: ${JSON.stringify(raw)}.`
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(
      `NEXT_PUBLIC_API_URL must use http or https; got ${url.protocol}`
    );
  }
  if (process.env.NODE_ENV === "production" && url.protocol === "http:") {
    // Local-dev escape: a production-mode Next.js build that points at
    // http://localhost is a docker-compose dev stack (next standalone always
    // builds in production mode). Block plain-http everywhere else.
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (!isLocalhost) {
      throw new Error(
        "NEXT_PUBLIC_API_URL must use https in production builds (or point at localhost for docker-compose dev)."
      );
    }
  }

  // Strip trailing slash for predictable concatenation.
  return raw.replace(/\/+$/, "");
}

// IMPORTANT: read each NEXT_PUBLIC_* var via a *static* `process.env.NAME`
// expression, not `process.env[name]`. Next.js inlines NEXT_PUBLIC_* vars at
// build time only when the property access is statically analysable. Using
// a dynamic property access (`process.env[someVar]`) leaves the lookup as a
// real runtime read against an empty object in the browser - which means
// any env-or-throw helper that does this silently throws on every page
// load. Each var gets its own one-line reader below.

function readSupabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!v) {
    if (process.env.NODE_ENV === "production") {
      // Local-dev escape: docker-compose dev stacks build in production mode
      // (next standalone) but point at localhost and may run mock-mode. Treat
      // both as not-prod so a blank Supabase URL doesn't fail the build.
      const isMock = readApiMode() === "mock";
      const isLocalhost = process.env.NEXT_PUBLIC_API_URL?.includes("localhost") ?? false;
      if (!isMock && !isLocalhost) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is required in production.");
      }
    }
    return "";
  }
  return v;
}

function readSupabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!v) {
    if (process.env.NODE_ENV === "production") {
      // Local-dev escape: see readSupabaseUrl above.
      const isMock = readApiMode() === "mock";
      const isLocalhost = process.env.NEXT_PUBLIC_API_URL?.includes("localhost") ?? false;
      if (!isMock && !isLocalhost) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required in production.");
      }
    }
    return "";
  }
  return v;
}

function readEnterpriseSsoEnabled(): boolean {
  // Enterprise SSO (per-org SAML / OIDC / SCIM) is deferred to Phase 12
  // per the scope policy in athena-docs/07-operations/local-readiness-
  // checklist.md. Until that lands, the sign-in surface for it always
  // 404s ("Enterprise not found"), so the button is hidden behind this
  // flag. Flip to "true" only in environments where the org-side
  // admin config + BE handshake actually work.
  return process.env.NEXT_PUBLIC_ENABLE_ENTERPRISE_SSO?.trim().toLowerCase() === "true";
}

const apiMode = readApiMode();

export const config = {
  apiUrl: readApiUrl(),
  apiMode,
  isMock: apiMode === "mock",
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Athena",
  isProd: process.env.NODE_ENV === "production",
  enterpriseSsoEnabled: readEnterpriseSsoEnabled(),
  supabase: {
    url: apiMode === "mock" ? "" : readSupabaseUrl(),
    anonKey: apiMode === "mock" ? "" : readSupabaseAnonKey(),
    isConfigured(): boolean {
      // In mock mode supabase is never used; report as "configured" so
      // existing call sites don't take their "not configured" branch.
      if (apiMode === "mock") return true;
      return Boolean(this.url && this.anonKey);
    },
  },
} as const;
