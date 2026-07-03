"use client";

/**
 * Faithful in-film recreations of the third-party tools Athena plugs into,
 * built from the user's reference screenshots so nothing is left for a real
 * capture. These are deliberately NOT Athena UI - they use each tool's own
 * dark theme + brand mark + composer chrome, with the Athena invocation
 * typed into the box. Text/caret are pure functions of a passed-in value so
 * the film timeline drives the typing deterministically.
 *
 * Components: CursorComposer, ClaudeCodeComposer, CodexComposer (compact,
 * for the S14 triptych) + CursorWindow (full IDE, S25) + SlackThread (S31) +
 * GitHubPR (S26). Colors are literal on purpose (foreign UIs, not tokens).
 */

import type { CSSProperties, ReactNode } from "react";

import { OwlGlyph } from "@/components/mascot/owl-glyph";

/* ------------------------------------------------------------------ marks */

/** Cursor's angular cube mark. */
function CursorMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id="cur-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e6e6e6" />
          <stop offset="1" stopColor="#8a8a8a" />
        </linearGradient>
      </defs>
      <path d="M12 2 L21 7 L21 17 L12 22 L3 17 L3 7 Z" fill="none" stroke="url(#cur-g)" strokeWidth="1.4" />
      <path d="M12 2 L12 12 L21 7 Z" fill="#cfcfcf" opacity="0.85" />
      <path d="M12 12 L12 22 L3 17 Z" fill="#9a9a9a" opacity="0.7" />
      <path d="M12 12 L21 17 L21 7 Z" fill="#bcbcbc" opacity="0.5" />
    </svg>
  );
}

/** Anthropic starburst (Claude). */
function AnthropicMark({ size = 20, color = "#D97757" }: { size?: number; color?: string }) {
  const blades = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      {blades.map((deg, i) => (
        <rect
          key={i}
          x={19}
          y={3}
          width={2}
          height={14}
          rx={1}
          fill={color}
          transform={`rotate(${deg} 20 20)`}
        />
      ))}
    </svg>
  );
}

/** OpenAI blossom (Codex), simplified six-fold knot. */
function OpenAIMark({ size = 18, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.2c1.9 0 3.5 1.3 3.9 3 .3.05.6.15.9.28 1.7.98 2.4 3.1 1.6 4.85.2.5.3 1 .3 1.55 0 1.95-1.4 3.6-3.3 3.95-.35 1.7-1.9 3-3.75 3-.5 0-1-.1-1.45-.3-1.75.8-3.87.1-4.85-1.6a3.9 3.9 0 0 1-.28-.9C3.5 19.4 2.2 17.8 2.2 15.9c0-.55.1-1.05.3-1.55-.8-1.75-.1-3.87 1.6-4.85.3-.13.6-.23.9-.28.4-1.7 2-3 3.9-3 .38 0 .76.05 1.1.15A3.9 3.9 0 0 1 12 3.2Z"
        fill="none"
        stroke={color}
        strokeWidth="1.3"
      />
    </svg>
  );
}

/** GitHub octocat glyph (simplified). */
function GitHubMark({ size = 20, color = "#ffffff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill={color}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/** Slack 4-color hash. */
function SlackMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M5 15a2 2 0 1 1-2-2h2v2Zm1 0a2 2 0 0 1 4 0v5a2 2 0 0 1-4 0v-5Z" fill="#E01E5A" />
      <path d="M9 5a2 2 0 1 1 2-2v2H9Zm0 1a2 2 0 0 1 0 4H4a2 2 0 0 1 0-4h5Z" fill="#36C5F0" />
      <path d="M19 9a2 2 0 1 1 2 2h-2V9Zm-1 0a2 2 0 0 1-4 0V4a2 2 0 0 1 4 0v5Z" fill="#2EB67D" />
      <path d="M15 19a2 2 0 1 1-2 2v-2h2Zm0-1a2 2 0 0 1 0-4h5a2 2 0 0 1 0 4h-5Z" fill="#ECB22E" />
    </svg>
  );
}

/* ------------------------------------------------------------------ atoms */

function Caret({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      style={{
        display: "inline-block",
        width: 2,
        height: "1.05em",
        marginLeft: 1,
        transform: "translateY(3px)",
        background: "currentColor",
        opacity: 0.9,
      }}
    />
  );
}

/** Small inline icon glyphs (stroke) reused across composers. */
function Icon({ d, size = 16, color = "currentColor", fill = "none" }: { d: string; size?: number; color?: string; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICON = {
  plus: "M12 5v14M5 12h14",
  mic: "M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3ZM5 10v1a7 7 0 0 0 14 0v-1M12 19v3",
  up: "M12 19V5M5 12l7-7 7 7",
  chevron: "M6 9l6 6 6-6",
  enter: "M9 10l-4 4 4 4M5 14h11a4 4 0 0 0 4-4V6",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M5 10h14v10H5z",
  hand: "M8 13V5a1.5 1.5 0 0 1 3 0v6m0-1V4a1.5 1.5 0 0 1 3 0v7m0-2V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-3-4a1.6 1.6 0 0 1 2.4-2.1L8 13",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
};

/* ------------------------------------------------- prefix-styled command */

function Command({
  prefix,
  prefixColor,
  value,
  caret,
  spellUnderline = false,
  color = "#ededed",
  size = 17,
}: {
  prefix: string;
  prefixColor: string;
  value: string;
  caret: boolean;
  spellUnderline?: boolean;
  color?: string;
  size?: number;
}) {
  return (
    <span style={{ fontSize: size, color, lineHeight: 1.5, letterSpacing: "-0.01em" }}>
      <span
        style={{
          color: prefixColor,
          textDecoration: spellUnderline ? "underline" : "none",
          textDecorationStyle: spellUnderline ? "wavy" : "solid",
          textDecorationColor: spellUnderline ? "#e5484d" : "transparent",
          textUnderlineOffset: 3,
        }}
      >
        {prefix}
      </span>
      {value ? " " + value : ""}
      <Caret on={caret} />
    </span>
  );
}

/* ============================================================== CURSOR ==== */

const CURSOR_BG = "#171717";
const CURSOR_BOX = "#232323";
const CURSOR_BORDER = "#333333";
const CURSOR_MUTED = "#8b8b8b";
const CURSOR_ORANGE = "#e0a24e";

export function CursorComposer({ value, sent, style }: { value: string; sent?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: CURSOR_BG,
        borderRadius: 16,
        padding: "22px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        outline: "1px solid #262626",
        ...style,
      }}
    >
      {/* breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: CURSOR_MUTED, fontSize: 14 }}>
        <span style={{ color: "#c6c6c6" }}>Home</span>
        <Icon d={ICON.chevron} size={13} color={CURSOR_MUTED} />
        <span style={{ margin: "0 2px" }}>
          <Icon d="M4 5h16v10H4zM2 19h20" size={14} color={CURSOR_MUTED} />
        </span>
        <span>Local</span>
      </div>

      {/* input box */}
      <div
        style={{
          background: CURSOR_BOX,
          border: `1px solid ${CURSOR_BORDER}`,
          borderRadius: 14,
          padding: "16px 16px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          minHeight: 120,
        }}
      >
        <div style={{ flex: 1 }}>
          <Command prefix="/athena" prefixColor={CURSOR_ORANGE} value={value} caret={!sent} color="#e9e9e9" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#2f2f2f", display: "grid", placeItems: "center" }}>
            <Icon d={ICON.plus} size={15} color="#b5b5b5" />
          </div>
          <span style={{ color: "#c2c2c2", fontSize: 14, display: "flex", alignItems: "center", gap: 7 }}>
            Composer 2.5 Fast <Icon d={ICON.lock} size={12} color={CURSOR_MUTED} />
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Icon d={ICON.mic} size={17} color={CURSOR_MUTED} />
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: sent ? "#e0a24e" : "#f5f5f5", display: "grid", placeItems: "center" }}>
              <Icon d={ICON.up} size={16} color="#111" />
            </div>
          </div>
        </div>
      </div>

      {/* action pills */}
      <div style={{ display: "flex", gap: 12 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#1f1f1f", border: "1px solid #333", borderRadius: 10, padding: "7px 12px", fontSize: 13, color: "#bdbdbd" }}>
          <span style={{ color: "#6aa3ff" }}>Plan</span> New Idea{" "}
          <span style={{ color: CURSOR_MUTED, fontSize: 11, border: "1px solid #3a3a3a", borderRadius: 4, padding: "1px 5px" }}>⇧Tab</span>
        </span>
        <span style={{ background: "#1f1f1f", border: "1px solid #333", borderRadius: 10, padding: "7px 12px", fontSize: 13, color: "#bdbdbd" }}>Multitask</span>
      </div>
    </div>
  );
}

/* ============================================================ CLAUDE CODE == */

const CC_BG = "#1c1b19";
const CC_BOX = "#242320";
const CC_BORDER = "#3a3733";
const CC_MUTED = "#a8a49c";
const CC_YELLOW = "#d6a13a";

/** Pixel critter (Claude Code's terminal companion), tiny + on-brand. */
function PixelCritter({ scale = 4 }: { scale?: number }) {
  const p = "#c9713f"; // clay
  const d = "#9c5230";
  const px = (x: number, y: number, c: string) => (
    <rect key={`${x}-${y}`} x={x * scale} y={y * scale} width={scale} height={scale} fill={c} />
  );
  // 8x5 little quadruped
  const cells: [number, number, string][] = [
    [5, 0, "#2b2b2b"], [6, 0, "#eee"], // checkered flag hint
    [1, 1, p], [2, 1, p], [3, 1, p], [4, 1, p],
    [0, 2, p], [1, 2, p], [2, 2, p], [3, 2, p], [4, 2, p], [5, 2, p],
    [1, 3, d], [2, 3, p], [3, 3, p], [4, 3, d],
    [1, 4, d], [4, 4, d],
    [0, 1, p],
  ];
  return (
    <svg width={8 * scale} height={5 * scale} viewBox={`0 0 ${8 * scale} ${5 * scale}`} aria-hidden>
      {cells.map(([x, y, c]) => px(x, y, c))}
    </svg>
  );
}

export function ClaudeCodeComposer({ value, sent, style }: { value: string; sent?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: CC_BG,
        borderRadius: 16,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        boxShadow: "0 24px 80px rgba(0,0,0,0.4)",
        outline: "1px solid #2a2825",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {[
          { icon: "M4 5h16v10H4zM2 19h20", label: "Local" },
          { icon: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", label: "handoff" },
        ].map((c) => (
          <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: `1px solid ${CC_BORDER}`, borderRadius: 8, padding: "5px 10px", color: CC_MUTED, fontSize: 13 }}>
            <Icon d={c.icon} size={13} color={CC_MUTED} /> {c.label}
          </span>
        ))}
        <span style={{ border: `1px solid ${CC_BORDER}`, borderRadius: 8, padding: "5px 8px", color: CC_MUTED }}>
          <Icon d="M6 3v12a3 3 0 0 0 3 3h6M6 3a2 2 0 1 0 0-.01M18 15a2 2 0 1 0 0 .01" size={13} color={CC_MUTED} />
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <PixelCritter scale={3} />
          <AnthropicMark size={20} />
        </div>
      </div>

      <div
        style={{
          background: CC_BOX,
          border: `1px solid ${CC_BORDER}`,
          borderRadius: 12,
          padding: "16px 16px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minHeight: 88,
        }}
      >
        <div style={{ flex: 1 }}>
          <Command prefix="/athena" prefixColor="#e9e9e9" value={value} caret={!sent} color="#e9e9e9" />
        </div>
        <Icon d={ICON.enter} size={18} color={CC_MUTED} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ color: CC_YELLOW, fontSize: 13, fontWeight: 600 }}>Bypass permissions</span>
        <Icon d={ICON.plus} size={15} color={CC_MUTED} />
        <Icon d={ICON.mic} size={15} color={CC_MUTED} />
        <Icon d={ICON.chevron} size={14} color={CC_MUTED} />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14, color: CC_MUTED, fontSize: 13 }}>
          <span>Opus 4.8</span>
          <span>Extra</span>
          <span style={{ width: 13, height: 13, borderRadius: "50%", border: `2px solid ${CC_MUTED}`, borderTopColor: "transparent", display: "inline-block" }} />
        </div>
      </div>
    </div>
  );
}

/* ================================================================= CODEX == */

const CX_BG = "#0d0d0d";
const CX_BOX = "#1a1a1a";
const CX_BORDER = "#2a2a2a";
const CX_MUTED = "#8a8a8a";

export function CodexComposer({ value, sent, heading = true, style }: { value: string; sent?: boolean; heading?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: CX_BG,
        borderRadius: 16,
        padding: "26px 26px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        justifyContent: "center",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
        outline: "1px solid #1c1c1c",
        ...style,
      }}
    >
      {heading && (
        <div style={{ textAlign: "center", color: "#ededed", fontSize: 26, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <OpenAIMark size={22} color="#ededed" /> What should we work on?
        </div>
      )}

      <div style={{ background: CX_BOX, border: `1px solid ${CX_BORDER}`, borderRadius: 14, padding: "16px 16px 12px", display: "flex", flexDirection: "column", gap: 18, minHeight: 108 }}>
        <div style={{ flex: 1 }}>
          <Command prefix="/athena" prefixColor="#ededed" value={value} caret={!sent} color="#ededed" spellUnderline />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: CX_MUTED, fontSize: 14 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon d={ICON.hand} size={16} color={CX_MUTED} /> Ask for approval <Icon d={ICON.chevron} size={13} color={CX_MUTED} />
          </span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#cfcfcf" }}>5.5</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>Medium <Icon d={ICON.chevron} size={13} color={CX_MUTED} /></span>
            <Icon d={ICON.mic} size={16} color={CX_MUTED} />
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#f5f5f5", display: "grid", placeItems: "center" }}>
              <Icon d={ICON.up} size={16} color="#111" />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 9, color: CX_MUTED, fontSize: 13 }}>
        <Icon d={ICON.file} size={15} color={CX_MUTED} /> athena-harness-smoke
      </div>
    </div>
  );
}

/* =========================================================== CURSOR (full) = */

/** A full Cursor IDE window: file rail + agent chat showing Athena MCP tool
 *  calls + composer. `progress` (0..1) reveals the agent transcript. */
export function CursorWindow({ progress, style }: { progress: number; style?: CSSProperties }) {
  const steps = [
    { at: 0.06, tool: "athena.search_decisions", detail: "ADR-041 - nightly settlement batching", ok: true },
    { at: 0.22, tool: "athena.read_repo_file", detail: "services/settlement/scheduler.py", ok: true },
    { at: 0.38, tool: "athena.lookup_symbol", detail: "ReconciliationEngine.process()", ok: true },
    { at: 0.54, tool: "athena.hybrid_retrieval", detail: "refund.approved event flow", ok: true },
  ];
  const shown = steps.filter((s) => progress >= s.at);
  const writing = progress >= 0.72;
  const done = progress >= 0.9;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: CURSOR_BG,
        borderRadius: 16,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "230px 1fr",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        boxShadow: "0 24px 90px rgba(0,0,0,0.45)",
        outline: "1px solid #262626",
        ...style,
      }}
    >
      {/* file rail */}
      <div style={{ background: "#141414", borderRight: "1px solid #262626", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#9a9a9a", fontSize: 13, marginBottom: 8 }}>
          <CursorMark size={16} /> refunds-api
        </div>
        {["settlement/", "scheduler.py", "reconciliation.py", "events.py", "tests/", "test_scheduler.py"].map((f, i) => (
          <div key={f} style={{ paddingLeft: f.endsWith("/") ? 4 : 16, color: f === "scheduler.py" ? "#e6e6e6" : "#7f7f7f", fontSize: 13, padding: "3px 6px", background: f === "scheduler.py" ? "#262626" : "transparent", borderRadius: 6 }}>
            {f.endsWith("/") ? "\u{1F4C1} " : "\u{1F4C4} "}{f}
          </div>
        ))}
      </div>

      {/* agent panel */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #262626", display: "flex", alignItems: "center", gap: 8, color: "#c6c6c6", fontSize: 14 }}>
          <CursorMark size={15} /> Agent
          <span style={{ marginLeft: "auto", fontSize: 12, color: CURSOR_MUTED, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AnthropicMark size={13} /> athena MCP connected
          </span>
        </div>
        <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, overflow: "hidden", minHeight: 0 }}>
          {/* user turn */}
          <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "#2a2a2a", border: "1px solid #363636", borderRadius: 12, padding: "10px 14px", color: "#e6e6e6", fontSize: 14.5 }}>
            Implement FEAT-14: event-driven same-day settlement. Follow our settlement decisions.
          </div>
          {/* tool calls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((s) => (
              <div key={s.tool} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ color: "#2ea043" }}>{"✓"}</span>
                <span style={{ color: "#c9a24e" }}>{s.tool}</span>
                <span style={{ color: CURSOR_MUTED }}>{s.detail}</span>
              </div>
            ))}
            {writing && (
              <div style={{ marginTop: 6, color: "#d6d6d6", fontSize: 14.5, lineHeight: 1.55 }}>
                Grounded in <b>ADR-041</b>. Replacing the nightly cron in{" "}
                <code style={{ color: "#c9a24e", fontFamily: "'JetBrains Mono', monospace" }}>scheduler.py</code> with a
                bounded event-driven window and adding tests{done ? " - done." : "..."}
              </div>
            )}
          </div>
        </div>
        {/* composer */}
        <div style={{ margin: "0 18px 16px", background: CURSOR_BOX, border: `1px solid ${CURSOR_BORDER}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#9a9a9a", fontSize: 14, flex: 1 }}>Ask Cursor, powered by Athena...</span>
          <span style={{ color: "#c2c2c2", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>Composer 2.5 Fast <Icon d={ICON.lock} size={11} color={CURSOR_MUTED} /></span>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#f5f5f5", display: "grid", placeItems: "center" }}>
            <Icon d={ICON.up} size={14} color="#111" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================= CODING AGENT ==== */

/** A vendor-neutral coding-agent IDE window: file rail + agent chat showing
 *  Athena MCP tool calls + composer. Used for the build scene so the story
 *  reads as "any coding agent, over MCP" rather than one specific tool (the
 *  named tools are established earlier in the clients triptych). `progress`
 *  (0..1) reveals the agent transcript. */
const AG_BG = "#15161a";
const AG_RAIL = "#101114";
const AG_BOX = "#1e2025";
const AG_BORDER = "#2c2f36";
const AG_MUTED = "#8b8f98";
const AG_ACCENT = "#6aa3ff";

/** Neutral "coding agent" mark: code brackets in a rounded square. */
function AgentMark({ size = 16, color = AG_ACCENT }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M9 9l-3 3 3 3M15 9l3 3-3 3" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The Athena owl as the "MCP connected" chip mark. */
function AthenaChip({ size = 15 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size, display: "inline-flex", flex: "none" }}>
      <OwlGlyph mood="idle" interactive={false} />
    </span>
  );
}

export function AgentWindow({ progress, style }: { progress: number; style?: CSSProperties }) {
  const steps = [
    { at: 0.06, tool: "athena.search_decisions", detail: "ADR-041 - nightly settlement batching", ok: true },
    { at: 0.22, tool: "athena.read_repo_file", detail: "services/settlement/scheduler.py", ok: true },
    { at: 0.38, tool: "athena.lookup_symbol", detail: "ReconciliationEngine.process()", ok: true },
    { at: 0.54, tool: "athena.hybrid_retrieval", detail: "refund.approved event flow", ok: true },
  ];
  const shown = steps.filter((s) => progress >= s.at);
  const writing = progress >= 0.72;
  const done = progress >= 0.9;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: AG_BG,
        borderRadius: 16,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: "230px 1fr",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        boxShadow: "0 24px 90px rgba(0,0,0,0.45)",
        outline: "1px solid #262a30",
        ...style,
      }}
    >
      {/* file rail */}
      <div style={{ background: AG_RAIL, borderRight: `1px solid ${AG_BORDER}`, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#c6c9cf", fontSize: 13, marginBottom: 8 }}>
          <AgentMark size={15} color="#c6c9cf" /> refunds-api
        </div>
        {["settlement/", "scheduler.py", "reconciliation.py", "events.py", "tests/", "test_scheduler.py"].map((f) => (
          <div key={f} style={{ paddingLeft: f.endsWith("/") ? 4 : 16, color: f === "scheduler.py" ? "#e6e6e6" : "#7f838b", fontSize: 13, padding: "3px 6px", background: f === "scheduler.py" ? "#24272d" : "transparent", borderRadius: 6 }}>
            {f.endsWith("/") ? "\u{1F4C1} " : "\u{1F4C4} "}{f}
          </div>
        ))}
      </div>

      {/* agent panel */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${AG_BORDER}`, display: "flex", alignItems: "center", gap: 8, color: "#c6c9cf", fontSize: 14 }}>
          <AgentMark size={15} /> Coding agent
          <span style={{ marginLeft: "auto", fontSize: 12, color: AG_MUTED, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AthenaChip size={14} /> Athena MCP connected
          </span>
        </div>
        <div style={{ flex: 1, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, overflow: "hidden", minHeight: 0 }}>
          {/* user turn */}
          <div style={{ alignSelf: "flex-end", maxWidth: "80%", background: "#2a2d33", border: `1px solid ${AG_BORDER}`, borderRadius: 12, padding: "10px 14px", color: "#e6e6e6", fontSize: 14.5 }}>
            Implement FEAT-14: event-driven same-day settlement. Follow our settlement decisions.
          </div>
          {/* tool calls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((s) => (
              <div key={s.tool} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontFamily: "'JetBrains Mono', monospace" }}>
                <span style={{ color: "#2ea043" }}>{"✓"}</span>
                <span style={{ color: AG_ACCENT }}>{s.tool}</span>
                <span style={{ color: AG_MUTED }}>{s.detail}</span>
              </div>
            ))}
            {writing && (
              <div style={{ marginTop: 6, color: "#d6d8dc", fontSize: 14.5, lineHeight: 1.55 }}>
                Grounded in <b>ADR-041</b>. Replacing the nightly cron in{" "}
                <code style={{ color: AG_ACCENT, fontFamily: "'JetBrains Mono', monospace" }}>scheduler.py</code> with a
                bounded event-driven window and adding tests{done ? " - done." : "..."}
              </div>
            )}
          </div>
        </div>
        {/* composer */}
        <div style={{ margin: "0 18px 16px", background: AG_BOX, border: `1px solid ${AG_BORDER}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#9a9ea6", fontSize: 14, flex: 1 }}>Ask your coding agent, powered by Athena...</span>
          <span style={{ color: AG_MUTED, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#2ea043" }} /> MCP: athena
          </span>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#f5f5f5", display: "grid", placeItems: "center" }}>
            <Icon d={ICON.up} size={14} color="#111" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================= SLACK == */

const SL_BG = "#1a1d21";
const SL_BORDER = "#2f3136";
const SL_TEXT = "#d1d2d3";
const SL_MUTED = "#9a9b9d";
const SL_MENTION_BG = "rgba(29,155,209,0.16)";
const SL_MENTION = "#4ea1e0";
const SL_GREEN = "#007a5a";

function Mention({ children }: { children: ReactNode }) {
  return (
    <span style={{ background: SL_MENTION_BG, color: SL_MENTION, borderRadius: 4, padding: "0 3px", fontWeight: 500 }}>{children}</span>
  );
}

/** The Slack exchange is a single coherent Q&A, on-story with the film:
 *  a teammate asks Athena for the status of the feature that just shipped,
 *  and the Athena app answers in-thread. */
export const SLACK_QUESTION = "what's the status of same-day refund settlement?";
const SLACK_ASKER = "Priya Nair";

export function SlackThread({
  value,
  sent,
  answered,
  style,
}: {
  /** composer text being typed after the @Athena mention (before it posts) */
  value: string;
  /** the question has been posted into the channel */
  sent?: boolean;
  /** the Athena app has replied in-thread */
  answered?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: SL_BG,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        color: SL_TEXT,
        boxShadow: "0 24px 90px rgba(0,0,0,0.45)",
        outline: "1px solid #101214",
        ...style,
      }}
    >
      {/* channel header */}
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${SL_BORDER}`, display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 700 }}>
        <SlackMark size={17} /> <span style={{ color: SL_MUTED, fontWeight: 700 }}>#</span> payments
      </div>

      <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}>
        {/* date divider */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "4px 0 14px" }}>
          <span style={{ border: `1px solid ${SL_BORDER}`, borderRadius: 20, padding: "3px 14px", fontSize: 12.5, color: SL_TEXT, fontWeight: 600, background: SL_BG }}>
            Today ⌄
          </span>
        </div>

        {/* the posted question - appears once sent */}
        {sent && (
          <div style={{ display: "flex", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#4a7fb5", display: "grid", placeItems: "center", flex: "none", color: "#fff", fontWeight: 700, fontSize: 13 }}>
              PN
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>{SLACK_ASKER}</span>
                <span style={{ color: SL_MUTED, fontSize: 12 }}>just now</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.46 }}>
                <Mention>@Athena</Mention> {SLACK_QUESTION}
              </div>
            </div>
          </div>
        )}

        {/* Athena app reply - Sophia (the owl) is the app icon, not a model logo */}
        {answered && (
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#eef2f7", display: "grid", placeItems: "center", flex: "none", border: "1px solid #d5deea", padding: 3 }}>
              <span style={{ width: 28, height: 28, display: "inline-flex" }}>
                <OwlGlyph mood="happy" interactive={false} />
              </span>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 15 }}>Athena</span>
                <span style={{ background: "#3d3f44", color: "#cfd0d1", fontSize: 10.5, fontWeight: 700, borderRadius: 3, padding: "1px 4px" }}>APP</span>
                <span style={{ color: SL_MUTED, fontSize: 12 }}>just now</span>
              </div>
              <div style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 640 }}>
                Same-day refund settlement <b>shipped</b>. The new scheduler (FEAT-14) on{" "}
                <code style={{ color: SL_MENTION, background: "#12303f", borderRadius: 3, padding: "0 4px", fontFamily: "'JetBrains Mono', monospace" }}>refunds-api</code>{" "}
                is event-driven now, approved by Rohan and merged. Grounded in ADR-041.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* composer */}
      <div style={{ margin: "0 16px 16px", border: `1px solid ${SL_BORDER}`, borderRadius: 10, overflow: "hidden", background: "#222529" }}>
        {/* format toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", borderBottom: `1px solid ${SL_BORDER}`, color: SL_MUTED }}>
          <span style={{ fontWeight: 800 }}>B</span>
          <span style={{ fontStyle: "italic" }}>I</span>
          <span style={{ textDecoration: "underline" }}>U</span>
          <span style={{ textDecoration: "line-through" }}>S</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <Icon d="M9 15l6-6M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2" size={15} color={SL_MUTED} />
          <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" size={15} color={SL_MUTED} />
          <Icon d="M8 6h13M8 12h13M8 18h13M4 6l-1 1M4 12l-1 1M4 18l-1 1" size={15} color={SL_MUTED} />
          <span style={{ opacity: 0.4 }}>|</span>
          <Icon d="M16 18l6-6-6-6M8 6l-6 6 6 6" size={15} color={SL_MUTED} />
        </div>
        <div style={{ padding: "12px 14px", fontSize: 15, minHeight: 26, color: sent ? SL_MUTED : SL_TEXT }}>
          {sent ? (
            <span style={{ opacity: 0.6 }}>Message #payments</span>
          ) : (
            <>
              <Mention>@Athena</Mention> {value}
              <Caret on={!sent} />
            </>
          )}
        </div>
        {/* bottom bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 12px", color: SL_MUTED }}>
          <Icon d={ICON.plus} size={16} color={SL_MUTED} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Aa</span>
          <span>{"\u{1F642}"}</span>
          <span>@</span>
          <span style={{ opacity: 0.4 }}>|</span>
          <Icon d="M23 7l-7 5 7 5V7zM1 5h15v14H1z" size={15} color={SL_MUTED} />
          <Icon d={ICON.mic} size={15} color={SL_MUTED} />
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
            <div style={{ background: SL_GREEN, borderRadius: "6px 0 0 6px", padding: "6px 10px", display: "grid", placeItems: "center" }}>
              <Icon d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" size={15} color="#fff" fill="none" />
            </div>
            <div style={{ background: SL_GREEN, borderLeft: "1px solid rgba(255,255,255,0.2)", borderRadius: "0 6px 6px 0", padding: "6px 6px" }}>
              <Icon d={ICON.chevron} size={13} color="#fff" />
            </div>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 18px 10px", textAlign: "right", color: SL_MUTED, fontSize: 12 }}>
        <b style={{ color: SL_TEXT }}>Shift + Enter</b> to add a new line
      </div>
    </div>
  );
}

/* =============================================================== GITHUB PR = */

const GH_BG = "#0d1117";
const GH_BORDER = "#30363d";
const GH_TEXT = "#e6edf3";
const GH_MUTED = "#8b949e";
const GH_GREEN = "#238636";

export function GitHubPR({ merged, style }: { merged?: boolean; style?: CSSProperties }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: GH_BG,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, 'Segoe UI', sans-serif",
        color: GH_TEXT,
        boxShadow: "0 24px 90px rgba(0,0,0,0.45)",
        outline: "1px solid #010409",
        ...style,
      }}
    >
      {/* top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${GH_BORDER}`, fontSize: 14, color: GH_MUTED }}>
        <GitHubMark size={20} />
        <span style={{ color: GH_TEXT }}>meridian-systems</span> / <span style={{ color: "#2f81f7" }}>refunds-api</span>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 400 }}>
          Same-day refund settlement <span style={{ color: GH_MUTED, fontWeight: 300 }}>#4127</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: merged ? "#8957e5" : GH_GREEN, color: "#fff", borderRadius: 20, padding: "6px 14px", fontSize: 14, fontWeight: 600 }}>
            <Icon d={merged ? "M6 3v12M18 9a3 3 0 1 0 0 6M6 21a3 3 0 1 0 0-6M6 15a9 9 0 0 0 9-6" : "M6 3v12M6 21a3 3 0 1 0 0-6M18 6a3 3 0 1 0 0-.01M18 9v3a3 3 0 0 1-3 3H6"} size={15} color="#fff" />
            {merged ? "Merged" : "Open"}
          </span>
          <span style={{ color: GH_MUTED, fontSize: 14 }}>
            <b style={{ color: GH_TEXT }}>athena-agent</b> wants to merge 2 commits into{" "}
            <code style={{ background: "#1f6feb26", color: "#2f81f7", borderRadius: 4, padding: "1px 6px" }}>main</code> from{" "}
            <code style={{ background: "#1f6feb26", color: "#2f81f7", borderRadius: 4, padding: "1px 6px" }}>athena/feat-14-same-day-settlement</code>
          </span>
        </div>

        {/* checks box */}
        <div style={{ border: `1px solid ${GH_BORDER}`, borderRadius: 8, overflow: "hidden", marginTop: 6 }}>
          <div style={{ padding: "12px 16px", background: "#161b22", display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
            <span style={{ width: 20, height: 20, borderRadius: "50%", background: GH_GREEN, display: "grid", placeItems: "center" }}>
              <Icon d="M20 6L9 17l-5-5" size={12} color="#fff" />
            </span>
            <b>All checks have passed</b>
            <span style={{ color: GH_MUTED, fontWeight: 400 }}>3 successful checks</span>
          </div>
          {[
            ["ci / test", "pytest 214 passed"],
            ["ci / lint", "ruff clean"],
            ["athena / review", "approved by Rohan Iyer"],
          ].map(([name, detail]) => (
            <div key={name} style={{ padding: "9px 16px", borderTop: `1px solid ${GH_BORDER}`, display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
              <span style={{ color: GH_GREEN }}>{"✓"}</span>
              <b style={{ fontWeight: 600 }}>{name}</b>
              <span style={{ color: GH_MUTED }}>{detail}</span>
            </div>
          ))}
        </div>

        {/* merge button */}
        <div style={{ marginTop: 4 }}>
          <span style={{ background: GH_GREEN, color: "#fff", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon d="M6 3v12M6 21a3 3 0 1 0 0-6M18 6a3 3 0 1 0 0-.01M18 9v3a3 3 0 0 1-3 3H6" size={15} color="#fff" />
            {merged ? "Merged" : "Merge pull request"}
          </span>
          <span style={{ color: GH_MUTED, fontSize: 13, marginLeft: 12 }}>A human always holds the merge.</span>
        </div>
      </div>
    </div>
  );
}
