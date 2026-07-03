"use client";

/**
 * Chapter 08 - Measure (S28 card, S29 what the feature cost).
 *
 * S29 is one 21s shot in three real surfaces:
 *   A  /cost           - real dashboard: scope tabs, date-range picker
 *                        (real popover + preset pick), plus a film-layer
 *                        attribution card built from the REAL cost atoms
 *                        (Ring / Eyebrow / Sparkline / DenseTable) fed
 *                        FILM_FEAT12_COST - there is no mock endpoint for
 *                        per-person-per-task attribution.
 *   B  /settings/alerts - Budgets & alerts: the real threshold rule (80%).
 *   C  /settings/danger - the models kill switch AT REST (never flipped),
 *                        then the real chat FAB opens its panel.
 */

import { Card } from "@/components/ui/card";
import { Stack, Cluster } from "@/components/layout/primitives";
import {
  DenseTable,
  Eyebrow,
  Ring,
  Sparkline,
} from "@/components/cost/cost-atoms";

import { ev, evo, lerp, type SceneDef } from "../engine";
import { Caption, ChapterCard, Cursor } from "../language";
import { IframeScene } from "../scene-hosts";
import { FILM_FEAT12_COST } from "../fixture";
import { prep, scrollMain } from "./ch2-5-setup";

/** The "Last 30 days" preset button that lives INSIDE the open popover.
 *  Excludes the trigger button, whose label also reads "Last 30 days" once a
 *  range is applied (matching the trigger would reopen the popover). */
function presetButton(doc: Document): HTMLButtonElement | undefined {
  return Array.from(doc.querySelectorAll<HTMLButtonElement>("button")).find(
    (b) =>
      b.textContent?.trim() === "Last 30 days" &&
      !b.getAttribute("aria-label")?.startsWith("Date range:"),
  );
}

const S28: SceneDef = {
  id: "s28-ch8-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="08" kicker="Chapter 08" title="Measure" />
  ),
};

/* ------------------------------------------------- attribution panel */

const fmtTokens = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`;

const fmtUsd = (n: number): string => `$${n.toFixed(2)}`;

/** Deterministic little spend curve for the sparkline (per-stage rhythm). */
const FEAT12_SPARK = [0.2, 0.5, 0.9, 1.4, 0.8, 1.0];

function AttributionPanel({ p }: { p: number }) {
  if (p <= 0) return null;
  const c = FILM_FEAT12_COST;
  return (
    <div
      style={{
        position: "absolute",
        left: 985,
        top: 205,
        width: 585,
        zIndex: 30,
        opacity: p,
        transform: `translateY(${lerp(34, 0, p)}px)`,
      }}
    >
      <Card variant="elevated" className="p-5 shadow-[var(--shadow-3)]">
        <Stack gap="4">
          <Cluster gap="4" align="center">
            <Ring pct={0.32} value={fmtUsd(c.total_usd)} label="Total" tone="success" size={96} />
            <Stack gap="1" className="min-w-0 flex-1">
              <Eyebrow>{c.display_id} · attribution</Eyebrow>
              <span className="text-base font-semibold text-[var(--text)]">{c.title}</span>
              <span className="text-xs text-[var(--text-muted)]">
                {fmtTokens(c.total_tokens)} tokens · 6 runs · idea to PR in 3 days
              </span>
              <Sparkline data={FEAT12_SPARK} />
            </Stack>
          </Cluster>
          <DenseTable
            head={["Who", "Stage", "Tokens", "Spend"]}
            align={["left", "left", "right", "right"]}
            rows={[
              ...c.rows.map((r) => [
                r.who,
                r.role,
                fmtTokens(r.tokens),
                fmtUsd(r.usd),
              ]),
              [
                <strong key="t">Total</strong>,
                "",
                <strong key="tk">{fmtTokens(c.total_tokens)}</strong>,
                <strong key="us">{fmtUsd(c.total_usd)}</strong>,
              ],
            ]}
          />
        </Stack>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- S29 */

const A_END = 9.8;
const B_END = 15.2;

const S29: SceneDef = {
  id: "s29-cost-measure",
  dur: 21,
  Comp: ({ t }) => {
    const segA = t < A_END;
    const segB = t >= A_END && t < B_END;
    const panel = evo(t, 4.6, 5.5) * (segA ? 1 : 0);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {segA && (
          <IframeScene
            src="/cost"
            t={t}
            steps={[
              { at: 0.05, apply: (doc) => prep(doc) },
              {
                at: 2.0,
                apply: (doc) => {
                  doc
                    .querySelector<HTMLButtonElement>('button[aria-label^="Date range:"]')
                    ?.click();
                },
              },
              {
                at: 3.4,
                apply: (doc) => {
                  const preset = presetButton(doc);
                  if (preset) preset.click();
                  else
                    doc
                      .querySelector<HTMLButtonElement>('button[aria-label^="Date range:"]')
                      ?.click();
                },
              },
            ]}
            drive={(doc, _win, tt) => {
              prep(doc);
              // Finish the pick only if it hasn't landed yet, and only ever
              // click the preset INSIDE the popover - never the trigger button
              // (its label also reads "Last 30 days" once applied, so clicking
              // it reopens the popover every frame -> the flicker). Once the
              // trigger shows the picked range, stop.
              if (tt >= 3.6 && tt < 4.8) {
                const trigger = doc.querySelector('button[aria-label^="Date range:"]');
                const applied = trigger?.getAttribute("aria-label")?.includes("Last 30 days");
                if (!applied) presetButton(doc)?.click();
              }
              scrollMain(doc, lerp(0, 240, ev(tt, 5.4, 9.2)));
            }}
          />
        )}
        {segB && (
          <IframeScene
            src="/settings/alerts"
            t={t}
            steps={[{ at: A_END + 0.05, apply: (doc) => prep(doc) }]}
            drive={(doc) => prep(doc)}
          />
        )}
        {!segA && !segB && (
          <IframeScene
            src="/settings/danger"
            t={t}
            steps={[
              { at: B_END + 0.05, apply: (doc) => prep(doc) },
              {
                at: 17.6,
                apply: (doc) => {
                  // The REAL page FAB - opening its docked panel.
                  doc
                    .querySelector<HTMLButtonElement>(
                      'button[aria-label="Ask Athena about this page"]',
                    )
                    ?.click();
                },
              },
              // The "Demo mode" composer strip is hidden from drive (below)
              // once the panel exists - removal only, nothing fabricated.
            ]}
            drive={(doc, _win, tt) => {
              prep(doc);
              // The click itself is the one-shot step at 17.6 - clicking
              // from drive would toggle the panel shut on the next frame
              // (the store commits after the drive runs). Here we only
              // settle what exists: FREEZE_CSS pauses entry animations at
              // 0%, so drop them once the panel is in the DOM.
              if (tt >= 17.7) {
                const panelEl = doc.querySelector<HTMLElement>(
                  'section[aria-label="Athena page assistant"]',
                );
                if (panelEl) {
                  panelEl.style.animation = "none";
                  for (const el of Array.from(
                    panelEl.querySelectorAll<HTMLElement>('[class*="animate-"]'),
                  )) {
                    el.style.animation = "none";
                  }
                }
                const note = Array.from(doc.querySelectorAll("div")).find(
                  (d) =>
                    d.childElementCount === 0 &&
                    d.textContent?.startsWith("Demo mode -"),
                );
                if (note) note.style.display = "none";
              }
            }}
          />
        )}

        <AttributionPanel p={panel} />

        <Cursor
          t={t}
          path={[
            { at: 1.0, x: 900, y: 400 },
            { at: 1.9, x: 1218, y: 196 },
            { at: 2.0, x: 1218, y: 196, click: true },
            { at: 3.3, x: 1190, y: 330 },
            { at: 3.4, x: 1190, y: 330, click: true },
            { at: 6.4, x: 1240, y: 560 },
            { at: 9.2, x: 1240, y: 560 },
            // Segment B - hover the 80% threshold rule.
            { at: 11.4, x: 980, y: 420 },
            { at: 13.8, x: 980, y: 500 },
            // Segment C - the kill switch at rest, then the FAB.
            { at: 16.4, x: 900, y: 360 },
            { at: 17.4, x: 1711, y: 961 },
            { at: 17.6, x: 1711, y: 961, click: true },
            { at: 19.2, x: 1660, y: 900 },
          ]}
        />

        <Caption t={t} a={0.8} b={5.2}>
          Every task. Every person. Every token.
        </Caption>
        <Caption t={t} a={10.4} b={16.4}>
          Budgets. Alerts. A kill switch.
        </Caption>
        <Caption t={t} a={18.4} b={20.7}>
          Ask about any page.
        </Caption>
      </div>
    );
  },
};

export const CH8: SceneDef[] = [S28, S29];
