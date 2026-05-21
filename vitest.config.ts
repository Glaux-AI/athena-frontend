import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest config — minimal. Test files live in `tests/unit/` and use the
 * `@/` import alias from tsconfig (e.g. `@/lib/utils/format`).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    // `node` for pure-logic tests; .test.tsx files that need a DOM should
    // include `// @vitest-environment jsdom` at the top of the file. Avoids
    // pulling jsdom in for tests that don't need it.
    environment: "node",
    globals: false,
    setupFiles: ["tests/unit/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "features/**", "components/**"],
    },
  },
});
