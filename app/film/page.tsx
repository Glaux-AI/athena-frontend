"use client";

/**
 * /film - the Athena demo-film harness. Dev-only, never linked from the
 * product. Renders the real product components on a deterministic timeline;
 * captured offline by athena-demo/_render_film.cjs.
 *
 * Requires NEXT_PUBLIC_API_MODE=mock (the film patches the in-process mock
 * fixture). In live mode this page renders a refusal note instead.
 */

import { config } from "@/lib/config";
import { FilmRoot, type SceneDef } from "@/components/film/engine";
import { FilmBoot } from "@/components/film/scene-hosts";
import { CH0 } from "@/components/film/scenes/ch0-open";
import { CH1_CORE } from "@/components/film/scenes/ch1-connect";
import { CH2_5 } from "@/components/film/scenes/ch2-5-setup";
import { CH6 } from "@/components/film/scenes/ch6-research";
import { CH7 } from "@/components/film/scenes/ch7-build";
import { CH8 } from "@/components/film/scenes/ch8-measure";
import { CH9 } from "@/components/film/scenes/ch9-everywhere";
import "@/components/film/film.css";

/* Pacing pass (v1.1): per-scene playback rates. Scene internals (captions,
 * steps, cursor) scale uniformly, so actions stay matched - the film just
 * moves brisker. Chapter cards and the capture-slot plates take the biggest
 * trims; dense read moments (chat answer, diff) the smallest. */
const RATE: Record<string, number> = {
  "s1-cold-open": 1.15,
  "s2-title": 1.1,
  "s5-ingest-hero": 1.2,
  "s4-github-connect": 1.15,
  "s6-integrations-cascade": 1.15,
  "s8-members-invite": 1.15,
  "s9-roles-matrix": 1.15,
  "s11-models-byok": 1.3,
  "s13-mcp-endpoint": 1.15,
  "s14-clients-triptych": 1.45,
  "s16-custom-agents": 1.25,
  "s17-skills-design": 1.25,
  "s19-priya-research": 1.15,
  "s20-share-thread": 1.1,
  "s21-task-proposal": 1.15,
  "s22-decompose-assign": 1.15,
  "s24-sara-design": 1.2,
  "s25-arjun-cursor": 1.35,
  "s26-rohan-review": 1.15,
  "s27-shipped": 1.1,
  "s29-cost-measure": 1.25,
  "s31-slack-mobile": 1.2,
  "s32-pullback": 1.2,
  "s33-end-card": 1.0,
};
/* Chapter interstitials (sN-chN-card) run at 1.5 (3s -> 2s). */
const CARD_RATE = 1.5;

function paced(scenes: SceneDef[]): SceneDef[] {
  return scenes.map((s) => ({
    ...s,
    rate: RATE[s.id] ?? (/-ch\d+-card$/.test(s.id) ? CARD_RATE : 1.1),
  }));
}

const SCENES = paced([
  ...CH0,
  ...CH1_CORE,
  ...CH2_5,
  ...CH6,
  ...CH7,
  ...CH8,
  ...CH9,
]);

export default function FilmPage() {
  if (!config.isMock) {
    return (
      <div style={{ padding: 48, fontFamily: "monospace" }}>
        /film requires NEXT_PUBLIC_API_MODE=mock
      </div>
    );
  }
  return (
    <FilmBoot>
      <FilmRoot scenes={SCENES} />
    </FilmBoot>
  );
}
