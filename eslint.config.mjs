/**
 * ESLint 9 flat-config - required because eslint@^9 dropped legacy .eslintrc
 * support. The FlatCompat shim from @eslint/eslintrc lets us keep using the
 * pre-existing `eslint-config-next` shareable preset (which still ships
 * legacy-style config); when Next ships a native flat preset we can drop the
 * shim. See: https://nextjs.org/docs/app/api-reference/config/eslint
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    // Don't lint generated, vendored, or build output.
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;
