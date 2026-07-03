"use client";

/**
 * Chapter 09 - Everywhere + CLOSE.
 * S30 chapter card, S31 diptych (Slack media slot + the real responsive app
 * in a phone bezel, drawer opened by really clicking the real hamburger),
 * S32 pull-back into the living knowledge graph resolving to Sophia,
 * S33 end card.
 *
 * The Slack panel is a timed media slot (real capture in the edit - never a
 * mocked-up third-party UI). The phone is the REAL app: an IframeScene at a
 * 375x812 viewport hitting /chat in the film's mock realm.
 */

import { useMemo } from "react";
import { Menu } from "lucide-react";

import { OwlGlyph } from "@/components/mascot/owl-glyph";
import { ChatMessage as ChatMessageRow } from "@/components/chat/chat-message";
import { ChatComposer } from "@/components/chat/chat-composer";
import { EntityGraph } from "@/components/topology/entity-graph";
import type { KnowledgeNode, KnowledgeEdge, ChatMessage as ChatMessageT } from "@/lib/api/client";

import { ev, evo, lerp, rand, seg, typed, type SceneDef } from "../engine";
import { Caption, ChapterCard, Cursor, Statement } from "../language";
import { SlackThread, SLACK_QUESTION } from "../clients";

const noop = () => {};

/* ------------------------------------------------- mobile chat (enabled) */

const M_QUESTION = "What changed in refunds recently?";
const M_ANSWER =
  "Same-day settlement shipped. The new scheduler (FEAT-14) is event-driven, and the PR on `refunds-api` was approved by Rohan and merged.";

function mMsg(id: string, role: "user" | "assistant", who: string, content: string, citations?: ChatMessageT["citations"]): ChatMessageT {
  return {
    id: `__m_${id}`,
    thread_id: "th_mobile",
    role,
    who,
    avatar: role === "assistant" ? "AT" : "",
    content,
    created_at: "2026-07-02T18:00:00Z",
    ...(citations ? { citations } : {}),
  };
}

/** A real, enabled-looking Athena chat rendered at mobile width - the real
 *  ChatMessage + ChatComposer components (the /chat page itself gates the
 *  composer in mock mode, so the film composes them directly here). */
function MobilePhoneChat({ t }: { t: number }) {
  const userShown = t >= 4.6;
  const answering = t >= 5.8;
  // Reveal the answer whole (fade in) rather than typing it out: typing a
  // markdown string char-by-char flips the inline-code spans mid-stream and
  // reflows the bubble every frame - that was the mobile "flicker".
  const answer = mMsg("a", "assistant", "Athena", M_ANSWER, [
    { label: "refunds-api", kind: "file", ref: "meridian/refunds-api" },
  ]);
  return (
    <div className="flex h-full flex-col bg-[var(--bg)]">
      {/* mobile top bar with the real hamburger */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <Menu className="size-5 text-[var(--text-muted)]" aria-hidden />
        <div className="flex items-center gap-1.5">
          <span className="size-6"><OwlGlyph mood="idle" interactive={false} /></span>
          <span className="text-sm font-semibold text-[var(--text)]">Athena</span>
        </div>
      </div>
      {/* transcript */}
      <div className="min-h-0 flex-1 space-y-4 overflow-hidden px-3 py-3 text-[13px]">
        {userShown && (
          <div style={{ opacity: evo(t, 4.6, 5.1) }}>
            <ChatMessageRow message={mMsg("q", "user", "Priya Nair", M_QUESTION)} onCitationOpen={noop} onEdit={noop} editDisabled onPickClarification={noop} cardsDisabled />
          </div>
        )}
        {answering && (
          <div style={{ opacity: evo(t, 5.8, 6.4) }}>
            <ChatMessageRow message={answer} onCitationOpen={noop} onEdit={noop} editDisabled onPickClarification={noop} cardsDisabled />
          </div>
        )}
      </div>
      {/* enabled composer */}
      <div className="border-t border-[var(--border)] px-3 py-3">
        <ChatComposer value="" onChange={noop} onSend={noop} onStop={noop} sending={false} placeholder="Ask Athena about your org..." />
      </div>
    </div>
  );
}

/* -------------------------------------------------- graph fixture (close) */
/* Same deterministic generator family as ch1-connect's ingest hero, kept
 * self-contained here so the close can restage the constellation. */

const DOMAINS = ["payments", "identity", "ledger", "notifications", "data", "web", "mobile", "infra"];

const REPO_NAMES = [
  "settlement-service", "reconciliation-engine", "refunds-api", "ledger-core",
  "webhook-gateway", "payments-orchestrator", "kyc-service", "risk-scoring",
  "notifications-hub", "web-dashboard", "mobile-app", "identity-provider",
  "billing-engine", "fx-rates", "dispute-center", "audit-trail",
  "data-warehouse-sync", "feature-flags", "search-indexer", "email-renderer",
];

function repoName(i: number): string {
  const base = REPO_NAMES[i % REPO_NAMES.length]!;
  return i < REPO_NAMES.length ? base : `${base}-${Math.floor(i / REPO_NAMES.length) + 1}`;
}

const GRAPH: { nodes: KnowledgeNode[]; edges: KnowledgeEdge[] } = (() => {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];
  let n = 0;
  for (let d = 0; d < DOMAINS.length; d++) {
    const count = 14 + Math.floor(rand(d * 7 + 2) * 8);
    const first = n;
    for (let k = 0; k < count; k++) {
      nodes.push({
        id: `n${n}`,
        node_kind: k === 0 ? "capability" : k < 4 ? "service" : "module",
        name: k === 0 ? DOMAINS[d]! : repoName(d * 19 + k),
        layer: DOMAINS[d]!,
        repo_id: `repo_${d}_${k}`,
        tags: [DOMAINS[d]!],
        centrality: k === 0 ? 0.9 : 0.15 + rand(n) * 0.5,
      } as KnowledgeNode);
      if (k > 0) {
        edges.push({
          source_id: `n${first + Math.floor(rand(n * 3) * k)}`,
          target_id: `n${n}`,
          kind: "depends_on",
        } as KnowledgeEdge);
      }
      n++;
    }
  }
  for (let c = 0; c < 26; c++) {
    const a = Math.floor(rand(c * 13 + 5) * n);
    const b = Math.floor(rand(c * 17 + 9) * n);
    if (a !== b) {
      edges.push({
        source_id: `n${a}`,
        target_id: `n${b}`,
        kind: "api_contract",
        cross_repo: true,
      } as KnowledgeEdge);
    }
  }
  return { nodes, edges };
})();

/* ---------------------------------------------------------------- scenes */

const S30: SceneDef = {
  id: "s30-ch9-card",
  dur: 3,
  Comp: ({ t, dur }) => (
    <ChapterCard t={t} dur={dur} num="09" kicker="Chapter 09" title="Everywhere" />
  ),
};

/* S31 - Slack + mobile diptych (15s). */

const PHONE_W = 375;
const PHONE_H = 812;

const S31: SceneDef = {
  id: "s31-slack-mobile",
  dur: 15,
  Comp: ({ t }) => {
    const leftIn = evo(t, 0.4, 1.3);
    const rightIn = evo(t, 1.0, 1.9);
    const slackTyped = typed(SLACK_QUESTION, t, 2.6, 4.8);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        {/* Left - faithful in-film Slack thread. */}
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 190,
            width: 900,
            height: 700,
            opacity: leftIn,
            transform: `translateY(${lerp(30, 0, leftIn)}px)`,
          }}
        >
          <SlackThread value={slackTyped} sent={t > 5.4} answered={t > 6.4} />
        </div>

        {/* Right - the REAL app at a mobile viewport, inside a phone bezel. */}
        <div
          style={{
            position: "absolute",
            left: 1190,
            top: 96,
            width: PHONE_W + 28,
            height: PHONE_H + 28,
            borderRadius: 52,
            background: "oklch(18% 0.012 260)",
            boxShadow:
              "0 2px 6px oklch(20% 0.02 250 / 0.2), 0 40px 110px oklch(20% 0.02 250 / 0.35)",
            padding: 14,
            opacity: rightIn,
            transform: `translateY(${lerp(36, 0, rightIn)}px)`,
          }}
        >
          <div
            style={{
              width: PHONE_W,
              height: PHONE_H,
              borderRadius: 40,
              overflow: "hidden",
              background: "oklch(100% 0 0)",
            }}
          >
            <MobilePhoneChat t={t} />
          </div>
          {/* Speaker notch bar - bezel dressing only. */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 26,
              width: 110,
              height: 8,
              borderRadius: 8,
              translate: "-50%",
              background: "oklch(30% 0.012 260)",
            }}
          />
        </div>

        <Caption t={t} a={1.2} b={3.6}>
          In Slack.
        </Caption>
        <Caption t={t} a={4.2} b={6.8}>
          On your phone.
        </Caption>
        <Caption t={t} a={10.2} b={14.2}>
          Wherever your team already is.
        </Caption>
      </div>
    );
  },
};

/* S32 - pull-back: the living graph resolves into Sophia (10s). */

/** Deterministic pulse positions riding the constellation. */
const PULSES = Array.from({ length: 9 }, (_, i) => ({
  x: 340 + rand(i * 5 + 3) * 1240,
  y: 220 + rand(i * 9 + 7) * 620,
  phase: rand(i * 3 + 1) * 3,
}));

const S32: SceneDef = {
  id: "s32-pullback",
  dur: 10,
  Comp: ({ t }) => {
    const graphIn = evo(t, 0.2, 1.4);
    const graphOut = ev(t, 7.4, 8.8);
    const owlIn = evo(t, 8.5, 9.6);
    const shown = useMemo(() => GRAPH, []);
    return (
      <div style={{ position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            overflow: "hidden",
            opacity: graphIn * (1 - graphOut),
            transform: `scale(${lerp(1.12, 1, graphIn) * lerp(1, 0.92, graphOut)})`,
          }}
        >
          {/* Oversized container: the explorer's corner chrome (hint pill,
              zoom controls, minimap) falls outside the stage crop. */}
          <div style={{ position: "absolute", left: -130, top: -80, width: 2180, height: 1240 }}>
            <EntityGraph
              nodes={shown.nodes}
              edges={shown.edges}
              height={1240}
              emptyTitle=""
              emptyDescription=""
            />
          </div>
          {/* Soft edge vignette: masks the explorer's corner chrome and keeps
              the close reading cinematic, not tool-like. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              boxShadow: "inset 0 0 260px 150px oklch(97.5% 0.005 264)",
            }}
          />
          {/* A quiet veil while the statement lines land, so the type reads. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: "oklch(97.5% 0.005 264)",
              opacity: t < 8.6 ? 0.42 : 0,
            }}
          />
          {/* Task pulses traveling the constellation. */}
          {PULSES.map((p, i) => {
            const cycle = (t + p.phase) % 3;
            const pp = seg(cycle, 0.2, 1.4);
            if (pp <= 0 || pp >= 1) return null;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: 14,
                  height: 14,
                  marginLeft: -7,
                  marginTop: -7,
                  borderRadius: "50%",
                  border: "2px solid oklch(50% 0.18 260 / 0.8)",
                  transform: `scale(${lerp(0.4, 2.4, pp)})`,
                  opacity: 1 - pp,
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            opacity: owlIn,
          }}
        >
          <div
            style={{
              width: 220,
              height: 220,
              transform: `scale(${lerp(0.6, 1, owlIn)})`,
              transformOrigin: "50% 100%",
            }}
          >
            <OwlGlyph mood="happy" />
          </div>
        </div>
        <Statement t={t} a={1.0} b={3.0} size={60}>
          One shared brain for your whole company.
        </Statement>
        <Statement t={t} a={3.4} b={5.4} size={64}>
          Every task, every dollar, tracked.
        </Statement>
        <Statement t={t} a={5.8} b={8.6} size={64}>
          Every step, yours to approve.
        </Statement>
      </div>
    );
  },
};

/* S33 - end card (6s). */

const S33: SceneDef = {
  id: "s33-end-card",
  dur: 6,
  Comp: ({ t }) => {
    const owlIn = evo(t, 0.2, 1.0);
    const wordIn = evo(t, 0.7, 1.5);
    const urlIn = evo(t, 1.4, 2.2);
    const liveIn = evo(t, 2.0, 2.8);
    const breathe = 1 + Math.sin(t * 1.4) * 0.008;
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: 22, transform: `scale(${breathe})` }}>
          <div style={{ width: 190, height: 190, opacity: owlIn, transform: `scale(${lerp(0.85, 1, owlIn)})` }}>
            <OwlGlyph mood="idle" />
          </div>
          <span className="film-lineclip">
            <span
              style={{
                display: "block",
                fontSize: 96,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                transform: `translateY(${(1 - wordIn) * 110}%)`,
              }}
            >
              Athena
            </span>
          </span>
          <span
            style={{
              fontSize: 30,
              fontWeight: 500,
              color: "oklch(20% 0.02 250 / 0.62)",
              opacity: urlIn,
              transform: `translateY(${(1 - urlIn) * 14}px)`,
            }}
          >
            tryathena.dev
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              fontSize: 19,
              fontWeight: 600,
              color: "oklch(50% 0.18 260)",
              border: "1px solid oklch(50% 0.18 260 / 0.3)",
              borderRadius: 999,
              padding: "8px 22px",
              background: "oklch(100% 0 0 / 0.9)",
              opacity: liveIn,
              transform: `translateY(${(1 - liveIn) * 12}px)`,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "oklch(50% 0.18 260)",
                opacity: 0.5 + 0.5 * Math.abs(Math.sin(t * 2.2)),
              }}
            />
            Live in production
          </span>
        </div>
      </div>
    );
  },
};

export const CH9: SceneDef[] = [S30, S31, S32, S33];
