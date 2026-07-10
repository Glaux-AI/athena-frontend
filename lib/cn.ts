import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Conditional class names that play nicely with Tailwind.
 * Use everywhere we'd otherwise write template-literal className strings.
 *
 * `text-micro` (the Nightglass 10px micro-label utility in globals.css) is
 * registered as a FONT-SIZE class: without this, tailwind-merge guesses it is
 * a text COLOR and silently strips it whenever a `text-[var(--…)]` color
 * appears later in the same cn() call.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-micro"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
