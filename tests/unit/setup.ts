/**
 * Vitest global setup. Anything that has to be available before each test
 * imports lives here. Kept intentionally small — feature-specific setup
 * belongs in the test file.
 *
 * `@testing-library/jest-dom/vitest` is imported only by tests that need
 * the extended matchers; doing it here would force the dependency on the
 * pure-logic tests too.
 */

// `lib/config.ts` validates NEXT_PUBLIC_API_URL at module load. The unit
// tests never hit the network, but importing modules that transitively
// import config (e.g. lib/api/client.ts) requires a valid value.
process.env.NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Mock mode by default — module-level config snapshot picks it up before
// any test file imports `lib/api/client.ts`. Tests that exercise live-mode
// behaviour can override per-test (vi.stubGlobal or a dedicated setup file).
process.env.NEXT_PUBLIC_API_MODE = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
