"use client";

/**
 * /film/hooks - the opening-hooks comparison reel. Dev-only, never linked
 * from the product. Same deterministic harness as /film, but its scene list
 * is the 7 top hooks, each cutting into the shared "Meet Athena" reveal.
 * Captured offline by athena-demo/_render_film.cjs with
 * FILM_URL=http://localhost:3100/film/hooks?hud=0.
 *
 * Requires NEXT_PUBLIC_API_MODE=mock (the FilmBoot seeds the mock session).
 */

import { config } from "@/lib/config";
import { FilmRoot } from "@/components/film/engine";
import { FilmBoot } from "@/components/film/scene-hosts";
import { HOOKS_REEL } from "@/components/film/scenes/hooks-reel";
import "@/components/film/film.css";

export default function HooksReelPage() {
  if (!config.isMock) {
    return (
      <div style={{ padding: 48, fontFamily: "monospace" }}>
        /film/hooks requires NEXT_PUBLIC_API_MODE=mock
      </div>
    );
  }
  return (
    <FilmBoot>
      <FilmRoot scenes={HOOKS_REEL} />
    </FilmBoot>
  );
}
