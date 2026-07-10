"use client";

/**
 * Chapters 02-05 - the setup arc (S4, S6-S17).
 *
 * S4  connect GitHub (restaged on the live /settings/integrations page)
 * S6  every other provider cascades to connected
 * S7-S9   People: members invite (real mock mutation) + roles matrix
 * S10-S11 Models: BYOK header, real enabled-model toggles, routing cards
 * S12-S13 Your tools: coding-agents MCP token minted for real
 * S14 Claude Code / Cursor / Codex media slots (real captures drop in)
 * S15-S17 Extend: agents registry (direct comp), skills + design tokens
 *
 * Every product frame is the real app: IframeScene mounts the real route on
 * the film-patched mock backend; direct compositions reuse the exact
 * building blocks the real pages render. DOM surgery only clones real
 * rendered nodes (S4 restage, S6 cascade) and is idempotent per step.
 */

import { Bot, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stack, Cluster, Grid } from "@/components/layout/primitives";
import { Segmented } from "@/components/ui/segmented";

import { ev, evo, lerp, seg, typed, type SceneDef } from "../engine";
import { Caption, Callout, ChapterCard, Cursor } from "../language";
import { IframeScene, ShellScene } from "../scene-hosts";
import { FILM_AGENTS, type FilmAgent } from "../fixture";
import type { FilmBridgeWindow } from "../fixture";
import { ShellFit } from "./ch6-research";
import { ClaudeCodeComposer, CursorComposer, CodexComposer } from "../clients";
import { AthenaChrome } from "../task-cockpit";
import { OwlGlyph } from "@/components/mascot/owl-glyph";

const noop = () => {};

/* --------------------------------------------------- iframe drive helpers */

/** Stage offset of the 1600x940 film frame inside the 1920x1080 stage. */
export const FX = 160;
export const FY = 70;

/** Per-frame prep inside an embedded doc: hide the Next.js dev overlay. */
export function prep(doc: Document): void {
  if (!doc.getElementById("film-prep")) {
    const s = doc.createElement("style");
    s.id = "film-prep";
    s.textContent = "nextjs-portal{display:none !important}";
    doc.head.appendChild(s);
  }
}

/** The app shell's scroll container (AppShell <main>). */
export function mainEl(doc: Document): HTMLElement | null {
  return doc.querySelector("main");
}

export function scrollMain(doc: Document, px: number): void {
  const main = mainEl(doc);
  if (main) main.scrollTop = Math.max(0, Math.round(px));
}

/** Scroll so the first h2/h3 containing `text` sits `offset` px below the
 *  main container's top. No-op until the heading exists (retry from drive). */
export function scrollToHeading(doc: Document, text: string, offset: number): boolean {
  const main = mainEl(doc);
  if (!main) return false;
  const el = Array.from(doc.querySelectorAll("h2, h3")).find((e) =>
    e.textContent?.includes(text),
  );
  if (!el) return false;
  const mainTop = main.getBoundingClientRect().top;
  const target = el.getBoundingClientRect().top - mainTop + main.scrollTop - offset;
  main.scrollTop = Math.max(0, Math.round(target));
  return true;
}

/** Set a React-controlled <input> value through the native setter so the
 *  controlled component actually updates its state. */
export function setReactInput(win: Window, el: HTMLInputElement, value: string): void {
  if (el.value === value) return;
  const w = win as Window & typeof globalThis;
  const desc = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
}

/** Same trick for a React-controlled <select>. */
export function setReactSelect(win: Window, el: HTMLSelectElement, value: string): void {
  if (el.value === value) return;
  const w = win as Window & typeof globalThis;
  const desc = Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, "value");
  desc?.set?.call(el, value);
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
}

const statusBadge = (card: Element): Element | null =>
  card.querySelector('span[aria-label^="Integration status"]');

const buttonByText = (root: Element, label: string): HTMLButtonElement | undefined =>
  Array.from(root.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );

/* ------------------------------------------------------------ S4 restage */

/** Restage GitHub to the disconnected look by cloning GitLab's REAL badge +
 *  Connect button (the fixture ships GitHub already active). Idempotent. */
function s4Restage(doc: Document): void {
  prep(doc);
  const gh = doc.querySelector('[data-testid="integration-card-github"]');
  const gl = doc.querySelector('[data-testid="integration-card-gitlab"]');
  if (!gh || !gl || doc.getElementById("film-s4-badge")) return;
  const ghBadge = statusBadge(gh);
  const glBadge = statusBadge(gl);
  const glConnect = buttonByText(gl, "Connect");
  const reauth = buttonByText(gh, "Reauthenticate");
  if (!ghBadge || !glBadge || !glConnect || !reauth) return;

  const badgeClone = glBadge.cloneNode(true) as HTMLElement;
  badgeClone.id = "film-s4-badge";
  (ghBadge as HTMLElement).style.display = "none";
  ghBadge.setAttribute("data-film-hidden", "1");
  ghBadge.after(badgeClone);

  for (const el of Array.from(gh.querySelectorAll<HTMLElement>("button, a"))) {
    el.style.display = "none";
    el.setAttribute("data-film-hidden", "1");
  }
  const connectClone = glConnect.cloneNode(true) as HTMLElement;
  connectClone.id = "film-s4-connect";
  reauth.parentElement?.insertBefore(connectClone, reauth);
}

/** Swap back to the REAL active state + fire the app's real sonner toast
 *  through the fixture bridge (never a lookalike). */
function s4Connect(doc: Document, win: Window): void {
  doc.getElementById("film-s4-badge")?.remove();
  doc.getElementById("film-s4-connect")?.remove();
  for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-film-hidden]"))) {
    el.style.display = "";
    el.removeAttribute("data-film-hidden");
  }
  (win as FilmBridgeWindow).__film?.toast.success("GitHub connected.");
}

const S4: SceneDef = {
  id: "s4-github-connect",
  dur: 12,
  Comp: ({ t }) => {
    // 400ms white flash eliding the OAuth handoff, right after the click.
    const flash =
      Math.min(seg(t, 5.2, 5.4), 1 - seg(t, 5.4, 5.7)) * 0.9;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <IframeScene
          src="/settings/integrations"
          t={t}
          steps={[
            { at: 0.05, apply: (doc) => s4Restage(doc) },
            { at: 5.2, apply: (doc, win) => s4Connect(doc, win) },
          ]}
          drive={(doc, _win, tt) => {
            prep(doc);
            // The card grid renders after the integrations fetch settles -
            // retry the restage until it lands (idempotent).
            if (tt < 5.0) s4Restage(doc);
          }}
        />
        {flash > 0 && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 35,
              background: "var(--surface)",
              opacity: flash,
            }}
          />
        )}
        <Cursor
          t={t}
          path={[
            { at: 1.0, x: 940, y: 560 },
            { at: 3.2, x: 780, y: 470 },
            { at: 4.8, x: 745, y: 417 },
            { at: 5.2, x: 745, y: 417, click: true },
            { at: 7.2, x: 940, y: 460 },
          ]}
        />
        <Caption t={t} a={0.8} b={4.8}>
          Connect your code hosts.
        </Caption>
        <Callout t={t} a={8.6} b={11.4} x={880} y={330}>
          312 repositories
        </Callout>
      </div>
    );
  },
};

/* ------------------------------------------------------------ S6 cascade */

const CASCADE: readonly string[] = [
  "gitlab", "bitbucket", "jira", "linear", "asana",
  "azure_devops", "slack", "figma", "notion", "confluence",
];

/** Flip one provider card to the connected look by cloning GitHub's REAL
 *  green badge (label per the app's own status map) + real Disconnect
 *  button. Idempotent per card. */
function flipProvider(doc: Document, slug: string): void {
  const card = doc.querySelector(`[data-testid="integration-card-${slug}"]`);
  const gh = doc.querySelector('[data-testid="integration-card-github"]');
  if (!card || !gh || card.querySelector("[data-film-connected]")) return;
  const badge = statusBadge(card);
  const ghBadge = statusBadge(gh);
  if (!badge || !ghBadge) return;

  const clone = ghBadge.cloneNode(true) as HTMLElement;
  clone.textContent = "Connected";
  clone.setAttribute("aria-label", "Integration status: Connected");
  clone.setAttribute("data-film-connected", "1");
  badge.replaceWith(clone);

  const connect = buttonByText(card, "Connect");
  if (connect) {
    connect.style.display = "none";
    const ghDisc = gh.querySelector('button[data-action="disconnect"]');
    if (ghDisc) {
      const d = ghDisc.cloneNode(true) as HTMLElement;
      d.setAttribute("data-film-connected", "1");
      d.setAttribute("aria-label", "Disconnect");
      connect.parentElement?.appendChild(d);
    }
  }
}

/** Re-apply every currently-due flip (idempotent; count rides on <html>). */
function applyDueFlips(doc: Document): void {
  const due = Number(doc.documentElement.getAttribute("data-film-flips") || "0");
  for (let i = 0; i < due && i < CASCADE.length; i++) {
    const slug = CASCADE[i];
    if (slug) flipProvider(doc, slug);
  }
}

/** The card grid re-renders when late fetches settle (availability rows),
 *  which wipes DOM surgery between frames. A MutationObserver re-applies
 *  the due flips whenever React swaps the subtree - self-healing and
 *  still a pure function of the flip count the drive writes for t. */
function ensureCascadeObserver(doc: Document): void {
  const w = doc.defaultView as
    | (Window & typeof globalThis & { __filmCascadeObs?: boolean })
    | null;
  if (!w || w.__filmCascadeObs) return;
  w.__filmCascadeObs = true;
  new w.MutationObserver(() => applyDueFlips(doc)).observe(doc.body, {
    childList: true,
    subtree: true,
  });
}

const S6: SceneDef = {
  id: "s6-integrations-cascade",
  dur: 11,
  Comp: ({ t }) => (
    <div style={{ position: "absolute", inset: 0 }}>
      <IframeScene
        src="/settings/integrations"
        t={t}
        steps={[{ at: 0.05, apply: (doc) => prep(doc) }]}
        drive={(doc, _win, tt) => {
          prep(doc);
          // The cascade lives in drive (idempotent per card) so it applies
          // as soon as the card grid has data, whatever the seek pattern.
          const due = CASCADE.filter((_, i) => tt >= 1.6 + i * 0.7).length;
          doc.documentElement.setAttribute("data-film-flips", String(due));
          ensureCascadeObserver(doc);
          applyDueFlips(doc);
          scrollMain(doc, lerp(0, 150, ev(tt, 4.5, 8.2)));
        }}
      />
      <Cursor
        t={t}
        path={[
          { at: 1.4, x: 1745, y: 320 },
          { at: 4.0, x: 1745, y: 520 },
          { at: 6.4, x: 1745, y: 740 },
          { at: 8.4, x: 1745, y: 800 },
        ]}
      />
      <Caption t={t} a={0.8} b={4.6}>
        Then connect everything else.
      </Caption>
    </div>
  ),
};

/* -------------------------------------------------------- CH02 People */

const S7: SceneDef = {
  id: "s7-ch2-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="02" kicker="Chapter 02" title="People" />
  ),
};

const INVITE_EMAIL = "priya@meridian.dev";

const S8: SceneDef = {
  id: "s8-members-invite",
  dur: 11,
  Comp: ({ t }) => (
    <div style={{ position: "absolute", inset: 0 }}>
      <IframeScene
        src="/settings/members"
        t={t}
        steps={[
          {
            at: 1.8,
            apply: (doc) => {
              prep(doc);
              doc.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
            },
          },
          {
            at: 5.0,
            apply: (doc, win) => {
              const sel = doc.querySelector<HTMLSelectElement>(
                'form select',
              );
              if (sel) setReactSelect(win, sel, "ws_admin");
            },
          },
          {
            at: 6.4,
            apply: (doc) => {
              doc.querySelector<HTMLButtonElement>('[data-testid="send-invite"]')?.click();
            },
          },
        ]}
        drive={(doc, win, tt) => {
          prep(doc);
          // Real keystroke rhythm into the REAL controlled invite input.
          if (tt >= 1.8 && tt < 6.2) {
            const input = doc.querySelector<HTMLInputElement>('input[type="email"]');
            if (input) setReactInput(win, input, typed(INVITE_EMAIL, tt, 1.9, 4.4));
          }
          scrollMain(doc, lerp(0, 140, ev(tt, 8.2, 10.4)));
        }}
      />
      <Cursor
        t={t}
        path={[
          { at: 1.0, x: 860, y: 500 },
          { at: 1.8, x: 1060, y: 318, click: true },
          { at: 4.8, x: 1495, y: 318 },
          { at: 5.0, x: 1495, y: 318, click: true },
          { at: 6.2, x: 1634, y: 318 },
          { at: 6.4, x: 1634, y: 318, click: true },
          { at: 8.8, x: 1100, y: 620 },
        ]}
      />
      <Caption t={t} a={0.8} b={4.4}>
        Bring in your team.
      </Caption>
    </div>
  ),
};

const S9: SceneDef = {
  id: "s9-roles-matrix",
  dur: 10,
  Comp: ({ t }) => (
    <div style={{ position: "absolute", inset: 0 }}>
      <IframeScene
        src="/settings/roles?role=role_reviewer"
        t={t}
        steps={[
          { at: 0.05, apply: (doc) => prep(doc) },
          {
            at: 6.6,
            apply: (doc) => {
              doc
                .querySelector<HTMLInputElement>('[data-testid="perm-cost:attribution"]')
                ?.click();
            },
          },
        ]}
        drive={(doc, _win, tt) => {
          prep(doc);
          scrollMain(doc, lerp(0, 560, ev(tt, 1.4, 5.8)));
          // Ensure the tick landed even if the step fired pre-hydration.
          if (tt >= 6.6) {
            const box = doc.querySelector<HTMLInputElement>(
              '[data-testid="perm-cost:attribution"]',
            );
            if (box && !box.checked) box.click();
          }
        }}
      />
      <Cursor
        t={t}
        path={[
          { at: 1.0, x: 1000, y: 420 },
          { at: 5.8, x: 1225, y: 566 },
          { at: 6.6, x: 1225, y: 566, click: true },
          { at: 8.6, x: 1260, y: 566 },
        ]}
      />
      <Caption t={t} a={0.8} b={4.8}>
        Every permission, yours to shape.
      </Caption>
      <Callout t={t} a={7.0} b={9.5} x={1300} y={480}>
        custom roles
      </Callout>
    </div>
  ),
};

/* -------------------------------------------------------- CH03 Models */

const S10: SceneDef = {
  id: "s10-ch3-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="03" kicker="Chapter 03" title="Models" />
  ),
};

const modelSwitches = (doc: Document): HTMLButtonElement[] =>
  Array.from(doc.querySelectorAll<HTMLButtonElement>('button[role="switch"]'));

/** Restage: the mock serves every Athena model enabled - flick them OFF via
 *  real clicks (real optimistic state) so the scene can flick them ON. */
function s11Restage(doc: Document): void {
  for (const sw of modelSwitches(doc)) {
    if (sw.getAttribute("aria-checked") === "true" && !sw.disabled) sw.click();
  }
}

function s11ToggleOn(doc: Document, index: number): void {
  const sw = modelSwitches(doc)[index];
  if (sw && sw.getAttribute("aria-checked") === "false" && !sw.disabled) sw.click();
}

const S11: SceneDef = {
  id: "s11-models-byok",
  dur: 19,
  Comp: ({ t }) => (
    <div style={{ position: "absolute", inset: 0 }}>
      <IframeScene
        src="/settings/models"
        t={t}
        steps={[
          { at: 0.05, apply: (doc) => { prep(doc); s11Restage(doc); } },
          { at: 6.0, apply: (doc) => s11ToggleOn(doc, 0) },
          { at: 7.4, apply: (doc) => s11ToggleOn(doc, 1) },
        ]}
        drive={(doc, _win, tt) => {
          prep(doc);
          if (tt < 4.5) s11Restage(doc); // retry until the models fetch lands
          if (tt >= 6.2) s11ToggleOn(doc, 0); // ensure the flicks landed
          if (tt >= 7.6) s11ToggleOn(doc, 1);
          const scroll =
            lerp(0, 370, ev(tt, 8.2, 10.4)) + lerp(0, 610, ev(tt, 12.6, 14.8));
          scrollMain(doc, scroll);
        }}
      />
      <Cursor
        t={t}
        path={[
          { at: 1.0, x: 800, y: 300 },
          { at: 5.4, x: 1680, y: 393 },
          { at: 6.0, x: 1680, y: 393, click: true },
          { at: 7.0, x: 1680, y: 441 },
          { at: 7.4, x: 1680, y: 441, click: true },
          { at: 9.2, x: 1200, y: 560 },
          { at: 14.8, x: 900, y: 460 },
          { at: 17.0, x: 940, y: 520 },
        ]}
      />
      <Caption t={t} a={0.8} b={5.2}>
        Bring your own keys.
      </Caption>
      <Caption t={t} a={13.6} b={18.2}>
        Your models. Your rules.
      </Caption>
    </div>
  ),
};

/* ----------------------------------------------------- CH04 Your tools */

const S12: SceneDef = {
  id: "s12-ch4-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="04" kicker="Chapter 04" title="Your tools" />
  ),
};

const S13: SceneDef = {
  id: "s13-mcp-endpoint",
  dur: 7,
  Comp: ({ t }) => {
    const zoom = evo(t, 3.4, 6.4);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <IframeScene
          src="/settings/integrations"
          t={t}
          frameStyle={{
            transform: `scale(${lerp(1, 1.08, zoom)}) translateY(${lerp(0, -24, zoom)}px)`,
          }}
          steps={[
            {
              at: 2.2,
              apply: (doc) => {
                doc.querySelector<HTMLButtonElement>('[data-action="mint"]')?.click();
              },
            },
            {
              at: 3.0,
              apply: (doc) => {
                scrollToHeading(doc, "Connect Claude Code to Athena", 420);
              },
            },
          ]}
          drive={(doc, _win, tt) => {
            prep(doc);
            // Open framed on the Coding agents rung; retry until it renders.
            if (tt < 2.0) scrollToHeading(doc, "Coding agents (MCP)", 70);
            // Retry the mint until the reveal card exists (one real mint -
            // while the POST is in flight the button is disabled, so the
            // retry cannot double-mint).
            if (tt >= 2.4 && tt < 4.5) {
              const revealed = doc.querySelector('[data-testid="coding-agent-token-reveal"]');
              if (!revealed) {
                doc.querySelector<HTMLButtonElement>('[data-action="mint"]')?.click();
              }
            }
            if (tt >= 3.0 && tt < 3.4) {
              scrollToHeading(doc, "Connect Claude Code to Athena", 420);
            }
          }}
        />
        <Cursor
          t={t}
          path={[
            { at: 0.8, x: 900, y: 500 },
            { at: 1.9, x: 950, y: 555 },
            { at: 2.2, x: 950, y: 555, click: true },
            { at: 4.2, x: 1000, y: 620 },
          ]}
        />
        <Caption t={t} a={0.8} b={4.4}>
          Athena speaks MCP.
        </Caption>
      </div>
    );
  },
};

/* S14 - three real clients, one brain. Faithful in-film recreations of each
 * tool's own UI (built from the reference screenshots): Athena is invoked
 * from each via its /athena MCP command, typed live. */

const S14: SceneDef = {
  id: "s14-clients-triptych",
  dur: 22,
  Comp: ({ t }) => {
    const finale = seg(t, 18.0, 19.0);
    const clients = [
      {
        key: "claude-code",
        live: [0.8, 7.5] as const,
        type: [1.4, 3.0] as const,
        cmd: "Start with IMPL-2",
        render: (v: string, sent: boolean) => <ClaudeCodeComposer value={v} sent={sent} />,
      },
      {
        key: "cursor",
        live: [7.5, 14.5] as const,
        type: [8.0, 9.6] as const,
        cmd: "Start task IMPL-2",
        render: (v: string, sent: boolean) => <CursorComposer value={v} sent={sent} />,
      },
      {
        key: "codex",
        live: [14.5, 20.0] as const,
        type: [15.0, 16.6] as const,
        cmd: "Start with IMPL-3",
        render: (v: string, sent: boolean) => <CodexComposer value={v} sent={sent} />,
      },
    ];
    // Athena reflects each run live: a row lands in its Activity feed the
    // moment each tool fires its /athena command.
    const activity = [
      { tool: "Claude Code", at: 3.7 },
      { tool: "Cursor", at: 10.3 },
      { tool: "Codex", at: 17.3 },
    ];
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {clients.map((c, i) => {
          const enter = evo(t, 0.5 + i * 0.25, 1.4 + i * 0.25);
          const isLive = t >= c.live[0] && t < c.live[1];
          const dim = isLive || finale > 0 ? 1 : 0.58;
          const pop = lerp(1, 1.03, isLive && finale === 0 ? ev(t, c.live[0], c.live[0] + 0.6) : 0);
          const value = typed(c.cmd, t, c.type[0], c.type[1]);
          const sent = t > c.type[1] + 0.6;
          return (
            <div
              key={c.key}
              style={{
                position: "absolute",
                left: 60 + i * 620,
                top: 84,
                width: 560,
                height: 300,
                opacity: enter * dim,
                transform: `translateY(${lerp(30, 0, enter)}px) scale(${pop})`,
                transition: "none",
              }}
            >
              {c.render(isLive || sent ? value : "", isLive ? sent : true)}
            </div>
          );
        })}

        {/* Athena Activity - updates in sync as each tool starts its run. */}
        <div style={{ position: "absolute", left: 260, top: 430, width: 1400, height: 470, opacity: evo(t, 1.4, 2.2) }}>
          <AthenaChrome url="app.tryathena.dev/activity" style={{ height: 470 }}>
            <div className="p-6">
              <div className="mb-4 text-lg font-semibold text-[var(--text)]">Activity</div>
              <div className="flex flex-col gap-2.5">
                {activity.map((r) => {
                  const rin = evo(t, r.at, r.at + 0.5);
                  if (rin <= 0) return null;
                  return (
                    <div
                      key={r.tool}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                      style={{ opacity: rin, transform: `translateY(${lerp(10, 0, rin)}px)` }}
                    >
                      <span className="size-7 shrink-0">
                        <OwlGlyph mood="working" interactive={false} />
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--info-soft)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--info-ink)]">
                        <span className="size-1.5 animate-pulse rounded-full bg-[var(--info)]" />
                        {r.tool} · working
                      </span>
                      <span className="text-sm text-[var(--text)]">started a task run over MCP</span>
                      <span className="ml-auto text-xs text-[var(--text-muted)]">just now</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </AthenaChrome>
        </div>

        <Caption t={t} a={1.2} b={4.2}>
          Claude Code.
        </Caption>
        <Caption t={t} a={8.0} b={11.0}>
          Cursor.
        </Caption>
        <Caption t={t} a={15.0} b={17.2}>
          Codex.
        </Caption>
        <Caption t={t} a={18.2} b={21.6}>
          Every run shows up in Athena, live.
        </Caption>
      </div>
    );
  },
};

/* --------------------------------------------------------- CH05 Extend */

const S15: SceneDef = {
  id: "s15-ch5-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="05" kicker="Chapter 05" title="Extend" />
  ),
};

/** Card meta the real /agents grid derives from API rows - mapped here from
 *  the fixture's FILM_AGENTS (the mock backend has no /v1/agents parity). */
const AGENT_META: Record<string, { uses: number; model: string }> = {
  "release-scout": { uses: 34, model: "claude-sonnet-4-6" },
  "spec-librarian": { uses: 12, model: "claude-haiku-4-5" },
};

/** One agent card - the exact markup AgentsPanel renders per row. */
function AgentCard({ agent, p }: { agent: FilmAgent; p: number }) {
  if (p <= 0) return null;
  const meta = AGENT_META[agent.slug] ?? { uses: 0, model: "claude-sonnet-4-6" };
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${lerp(26, 0, p)}px) scale(${lerp(0.97, 1, p)})`,
      }}
    >
      <Card className="h-full">
        <Stack gap="3">
          <Cluster justify="between" align="start">
            <Stack gap="0">
              <h3 className="text-base font-semibold leading-tight">{agent.name}</h3>
              <span className="text-xs text-[var(--text-muted)]">{agent.slug}</span>
            </Stack>
            <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--success-ink)]">
              Org-wide
            </span>
          </Cluster>
          <p className="line-clamp-2 min-h-[2.5rem] text-sm text-[var(--text-muted)]">
            {agent.description}
          </p>
          <Cluster gap="3" align="center" className="text-xs text-[var(--text-muted)]">
            <span>
              <strong className="text-[var(--text)]">{agent.tools.length}</strong> tools
            </span>
            <span>·</span>
            <span>
              <strong className="text-[var(--text)]">{meta.uses}</strong> uses
            </span>
            <span>·</span>
            <span className="truncate">{meta.model}</span>
          </Cluster>
        </Stack>
      </Card>
    </div>
  );
}

const S16: SceneDef = {
  id: "s16-custom-agents",
  dur: 14,
  Comp: ({ t }) => {
    const card1 = evo(t, 1.6, 2.5);
    const card2 = evo(t, 7.8, 8.7); // the just-built agent lands org-shared
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <ShellFit />
        <ShellScene>
          {/* The real /agents page chrome: header + tabs + New agent. */}
          <Stack gap="6">
            <Stack gap="4" className="border-b border-[var(--border)] pb-5">
              <Cluster gap="2.5" align="center">
                <Bot className="size-5 text-[var(--primary)]" aria-hidden />
                <Stack gap="1" className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight">Custom agents</h1>
                  <p className="text-sm text-[var(--text-muted)]">
                    Build agents with your own system prompt, model, and tools, then pick
                    them in chat.
                  </p>
                </Stack>
              </Cluster>
              <Segmented<"agents" | "tools">
                ariaLabel="Registry section"
                size="md"
                value="agents"
                onChange={noop}
                options={[
                  { value: "agents", label: "Agents" },
                  { value: "tools", label: "Tools" },
                ]}
              />
            </Stack>
            <Cluster justify="end">
              <Button data-testid="agents-new">
                <Plus className="size-4" />
                New agent
              </Button>
            </Cluster>
            <Grid cols="auto-fit-320" gap="4">
              {FILM_AGENTS[0] && <AgentCard agent={FILM_AGENTS[0]} p={card1} />}
              {FILM_AGENTS[1] && <AgentCard agent={FILM_AGENTS[1]} p={card2} />}
            </Grid>
          </Stack>
        </ShellScene>
        <Cursor
          t={t}
          path={[
            { at: 1.2, x: 1000, y: 420 },
            { at: 3.2, x: 1580, y: 388 },
            { at: 6.4, x: 620, y: 560 },
            { at: 9.6, x: 1105, y: 505 },
            { at: 11.6, x: 1105, y: 505 },
          ]}
        />
        <Caption t={t} a={1.0} b={5.6}>
          Build your own agents.
        </Caption>
        <Caption t={t} a={8.6} b={13.2}>
          Share them with the whole org.
        </Caption>
      </div>
    );
  },
};

/* S17 - skills, then the org's design language. */

const S17: SceneDef = {
  id: "s17-skills-design",
  dur: 15,
  Comp: ({ t }) => {
    const first = t < 7.8;
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {first ? (
          <IframeScene
            src="/skills"
            t={t}
            steps={[{ at: 0.05, apply: (doc) => prep(doc) }]}
            drive={(doc) => prep(doc)}
          />
        ) : (
          <IframeScene
            src="/design-tokens?system=ds_meridian"
            t={t}
            steps={[{ at: 7.85, apply: (doc) => prep(doc) }]}
            drive={(doc) => prep(doc)}
          />
        )}
        <Cursor
          t={t}
          path={
            first
              ? [
                  { at: 1.0, x: 700, y: 480 },
                  { at: 2.4, x: 591, y: 360 },
                  { at: 5.4, x: 1670, y: 186 },
                  { at: 7.4, x: 1670, y: 186, click: true },
                ]
              : [
                  { at: 8.4, x: 700, y: 500 },
                  { at: 10.0, x: 510, y: 560 },
                  { at: 12.2, x: 1150, y: 520 },
                ]
          }
        />
        <Caption t={t} a={1.0} b={4.8}>
          Teach it skills.
        </Caption>
        <Caption t={t} a={8.8} b={13.2}>
          Give it your design language.
        </Caption>
      </div>
    );
  },
};

export const CH2_5: SceneDef[] = [
  S4, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15, S16, S17,
];
