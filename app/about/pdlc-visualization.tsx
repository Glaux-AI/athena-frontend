"use client";

/**
 * PdlcVisualization - the About page's PDLC engine visualization.
 *
 * A thin client wrapper around the landing "film" carousel (FilmStage). It
 * tells the same nine-frame PDLC narrative as the landing page, but the CTA on
 * the final frame routes to /login (the About page has no in-page sign-in card,
 * unlike the landing page which jumps to its own sign-in panel).
 *
 * FilmStage owns its own `mx-auto w-full max-w-[1200px] px-4 lg:px-10`
 * container, so the mounting <section> must not double-wrap those classes.
 */

import { useRouter } from "next/navigation";

import { FilmStage } from "@/app/login/film/stage";

export function PdlcVisualization() {
  const router = useRouter();
  return <FilmStage onJumpToSignIn={() => router.push("/login")} />;
}
