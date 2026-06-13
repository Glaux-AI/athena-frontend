import type { Config } from "tailwindcss";

/**
 * Tailwind v4 config. We rely heavily on CSS variables (see styles/tokens.css)
 * rather than baking colors into Tailwind's theme. This keeps theme switching +
 * tenant brand overrides cheap.
 *
 * Per UX standard §3: never use Tailwind color literals in components.
 * Always reference tokens via `text-[var(--text)]`, `bg-[var(--surface)]`.
 */
export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      spacing: {
        // 4px scale matches `--space-*` tokens; Tailwind already has 1=4px / 2=8px etc.
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
      transitionTimingFunction: {
        athena: "cubic-bezier(.4, 0, .2, 1)",
      },
      transitionDuration: {
        athena: "200ms",
      },
      // NOTE: Tailwind v4 runs here without an `@config` directive, so this JS
      // theme is NOT loaded - keyframes/animation declared here never emit.
      // All custom animations (the Sophia owl `animate-sophia-*` set included)
      // are therefore defined as plain CSS in app/globals.css, alongside the
      // other custom animations (.animate-modal-in, .animate-pop-in, …).
    },
  },
  plugins: [],
} satisfies Config;
