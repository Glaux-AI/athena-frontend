/**
 * Centralized runtime configuration. **The only place** `process.env.*` is
 * read in the app.
 *
 * Both values below are public (bundled into the browser). Never put a
 * secret in any NEXT_PUBLIC_* var.
 *
 * Fails closed in production if `NEXT_PUBLIC_API_URL` is missing or invalid —
 * we'd rather refuse to build than ship a frontend that silently sends
 * authenticated requests to the wrong origin.
 */

function readApiUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      // Throw at module load — Next.js build will fail loudly.
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
    // Allow only for explicit localhost development pointing at a remote
    // staging API over HTTP — never in production.
    throw new Error(
      "NEXT_PUBLIC_API_URL must use https in production builds."
    );
  }

  // Strip trailing slash for predictable concatenation.
  return raw.replace(/\/+$/, "");
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export const config = {
  apiUrl: readApiUrl(),
  appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Athena",
  isProd: process.env.NODE_ENV === "production",
  // Demo affordances on the dashboard (Start demo run, Generate a PRD).
  // Defaults to true in dev; production builds can set NEXT_PUBLIC_ENABLE_DEMO=false
  // once real runs ship.
  enableDemo: readBool("NEXT_PUBLIC_ENABLE_DEMO", true),
} as const;
