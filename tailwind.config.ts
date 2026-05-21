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
      keyframes: {
        "sophia-blink": {
          "0%, 90%, 100%": { transform: "scaleY(1)" },
          "94%, 97%": { transform: "scaleY(0.1)" },
        },
        "sophia-tilt": {
          "0%, 100%": { transform: "rotate(-4deg)" },
          "50%": { transform: "rotate(4deg)" },
        },
        "sophia-hop": {
          "0%, 100%": { transform: "translateY(0)" },
          "45%, 55%": { transform: "translateY(-3px)" },
        },
        "sophia-breathe": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        "sophia-wing-l": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(-22deg)" },
        },
        "sophia-wing-r": {
          "0%, 100%": { transform: "rotate(0deg)" },
          "50%": { transform: "rotate(22deg)" },
        },
        "sophia-halo": {
          "0%, 100%": { opacity: "0.35", transform: "scale(0.95)" },
          "50%": { opacity: "0.7", transform: "scale(1.06)" },
        },
        "sophia-alert": {
          "0%, 100%": { transform: "scale(1)" },
          "30%, 70%": { transform: "scale(1.18)" },
        },
        "sophia-sparkle": {
          "0%, 100%": { opacity: "0.25", transform: "scale(0.7) rotate(0deg)" },
          "50%": { opacity: "1", transform: "scale(1.15) rotate(180deg)" },
        },
        "sophia-dot": {
          "0%, 100%": { opacity: "0.25" },
          "50%": { opacity: "1" },
        },
        "sophia-float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
      },
      animation: {
        "sophia-blink": "sophia-blink 4.5s ease-in-out infinite",
        "sophia-tilt": "sophia-tilt 3.5s ease-in-out infinite",
        "sophia-hop": "sophia-hop 1.4s ease-in-out infinite",
        "sophia-breathe": "sophia-breathe 2.6s ease-in-out infinite",
        "sophia-wing-l": "sophia-wing-l 0.6s ease-in-out infinite",
        "sophia-wing-r": "sophia-wing-r 0.6s ease-in-out infinite",
        "sophia-halo": "sophia-halo 2.4s ease-in-out infinite",
        "sophia-alert": "sophia-alert 1.5s ease-in-out infinite",
        "sophia-sparkle-1": "sophia-sparkle 2.4s ease-in-out infinite",
        "sophia-sparkle-2": "sophia-sparkle 2.4s ease-in-out 0.4s infinite",
        "sophia-sparkle-3": "sophia-sparkle 2.4s ease-in-out 0.8s infinite",
        "sophia-dot-1": "sophia-dot 1.4s ease-in-out infinite",
        "sophia-dot-2": "sophia-dot 1.4s ease-in-out 0.18s infinite",
        "sophia-dot-3": "sophia-dot 1.4s ease-in-out 0.36s infinite",
        "sophia-float": "sophia-float 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
