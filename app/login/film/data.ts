/**
 * Film data - the cast and the eleven segments of the landing film.
 *
 * The film is a set of zoomed-in shots of the REAL product: connect a repo,
 * type a question, wire in the team and the stack, plug in your own coding
 * agents, then follow one feature through gates to a merged PR - and end on
 * the two things that make it safe to run org-wide: the security floor and
 * the cost ledger. No invented people, no invented company: the stations on
 * the workline are the roles around the person watching (product, design,
 * engineering, admin), and the gates that matter most - the diff, the merge -
 * belong to "you". AI does the work between human decisions; the copy stays
 * second-person so the viewer is always in the frame.
 *
 * Every line is checked against what ships today. Copy stays plain-language
 * for every kind of customer - no database/protocol jargon, and no counts
 * that grow with the product (connector totals, tool totals, provider totals
 * all expand; the page must not pin them). `stamp` is the human moment that
 * pops at the segment's station.
 */

import type { OwlMood } from "@/components/mascot/owl-avatar";

export interface Role {
  /** Short tag shown in the avatar circle ("PM", "ENG", "YOU"). */
  tag: string;
  /** The seat it represents. */
  label: string;
}

export const ROLES: Record<string, Role> = {
  pm: { tag: "PM", label: "Product" },
  design: { tag: "UX", label: "Design" },
  lead: { tag: "LEAD", label: "Eng lead" },
  eng: { tag: "ENG", label: "Engineering" },
  admin: { tag: "ADM", label: "Admin" },
  you: { tag: "YOU", label: "That's you" },
};

export type SceneKey =
  | "connect"
  | "ask"
  | "team"
  | "stack"
  | "agents"
  | "plan"
  | "build"
  | "ship"
  | "security"
  | "receipt"
  | "cta";

export interface Segment {
  id: SceneKey;
  kicker: string;
  headline: string;
  sub: string;
  /** The honest one-liner - what Athena does / how it behaves here. */
  boundary: string;
  /** Sophia's mood while this segment is under the playhead. */
  mood: OwlMood;
  /** Sophia's one-line speech bubble. */
  says: string;
  /** Station at the END of the segment: which seat acts, and the stamp. */
  station: { role: keyof typeof ROLES | null; stamp: string; tone: "ok" | "go" };
  /** Feature-card status while crossing this segment (task-card idiom). */
  baton: { status: string; pill: "idle" | "running" | "review" | "done"; cost: string };
}

export const SEGMENTS: readonly Segment[] = [
  {
    id: "connect",
    kicker: "Step one",
    headline: "Connect your repos.",
    sub: "Sign in with GitHub and pick your repos - one or all of them. Athena reads every file and builds one living map of your whole org: what each thing does, how it's built, how it all connects - and it flags the moment anything falls behind.",
    boundary: "What Athena learns is visible to your org only - delete a repo and it's erased with it.",
    mood: "reading",
    says: "3,411 files. Reading every one.",
    station: { role: "admin", stamp: "3 repos attached", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "ask",
    kicker: "The question",
    headline: "Type a question. Get the org's answer.",
    sub: "Anyone can ask, in plain language - even straight from Slack. The answer streams back with sources pointing into the real code; share the thread with your team, pin it, or turn it into a task in one click.",
    boundary: "No source, no claim. Chat reads the codebase; it never edits it.",
    mood: "focused",
    says: "Found it - charge.py, line 84.",
    station: { role: "pm", stamp: "Proposed as a feature", tone: "go" },
    baton: { status: "Backlog", pill: "idle", cost: "$0.03" },
  },
  {
    id: "team",
    kicker: "The team",
    headline: "Wire in your whole team.",
    sub: "Invite by email, pick a role - or define your own. Roles and their permissions are fully yours to shape, teams get their own board, and PMs, designers, and admins get the same surface as engineers.",
    boundary: "Permissions are data, not code - rename, re-permission, or delete any role.",
    mood: "happy",
    says: "Five seats, five different jobs. All in.",
    station: { role: "admin", stamp: "Invites sent", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "stack",
    kicker: "The stack",
    headline: "Your tools plug in.",
    sub: "Source control, project trackers, chat, docs, design - each connection teaches Athena more about how your org works, and the list keeps growing. Any major AI provider runs the models, on your keys or Athena credit. You can even build your own agents and share them with a domain or the whole org.",
    boundary: "All optional - source control alone is enough to start.",
    mood: "focused",
    says: "Wired in. Your keys stay yours.",
    station: { role: "admin", stamp: "Stack connected", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "agents",
    kicker: "Your coding agents",
    headline: "Your coding agents plug in too.",
    sub: "Create a key and one command connects Claude Code, Cursor, Codex, or Gemini. Your agent now works with your org's full knowledge, picks up tasks from the board, and submits its work - attributed by name, under the same gates as everyone else.",
    boundary: "Your agent can read, plan, and build. Approving and merging stay with people.",
    mood: "working",
    says: "Claude Code just claimed TSK-215.",
    station: { role: "eng", stamp: "Agent connected", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "plan",
    kicker: "The draft",
    headline: "Athena drafts. Your people approve.",
    sub: "Frame, research, PRD - written from org knowledge, every claim cited. Then the split: subtasks of any type with dependencies wired, held at a hard gate until your lead says go.",
    boundary: "The plan is reviewable before anything spawns.",
    mood: "writing",
    says: "PRD's ready. Over to your lead.",
    station: { role: "lead", stamp: "Plan approved", tone: "ok" },
    baton: { status: "In progress", pill: "running", cost: "$0.47" },
  },
  {
    id: "build",
    kicker: "The build",
    headline: "Everyone builds in parallel.",
    sub: "The subtasks hit the board and your team picks them up - design in one lane, a teammate's coding agent in another, Athena running a third. Blocked work waits for its dependencies. And the diff comes to you, line by line, before any PR exists.",
    boundary: "Blocked means blocked - work starts only when its dependencies are done.",
    mood: "working",
    says: "TSK-218 was waiting on 215. It's free now.",
    station: { role: "you", stamp: "Diff approved by you", tone: "ok" },
    baton: { status: "In progress", pill: "running", cost: "$1.86" },
  },
  {
    id: "ship",
    kicker: "The ship",
    headline: "It opens the PR. You merge.",
    sub: "The change lands as a draft pull request on your repo, running your real CI. If a check fails, Athena reads the log, pushes a fix, and re-runs. The subtasks roll up; you press merge.",
    boundary: "Your repo, your reviews, your branch rules - merge stays on your call.",
    mood: "happy",
    says: "Checks green. Over to you.",
    station: { role: "you", stamp: "Merged by you", tone: "go" },
    baton: { status: "In review", pill: "review", cost: "$2.28" },
  },
  {
    id: "security",
    kicker: "The floor",
    headline: "Locked down by default.",
    sub: "Your data is walled off to your org - enforced twice over, so one mistake can never open the wall. Keys are encrypted and never shared between people. No AI can approve its own work. And spending is checked before every single call.",
    boundary: "Your code stays yours - walled off, encrypted, and erased on delete.",
    mood: "focused",
    says: "Your org's data. No one else's.",
    station: { role: null, stamp: "Locked by design", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "receipt",
    kicker: "The receipt",
    headline: "Every token, on the ledger.",
    sub: "Every call is metered - model, tokens, cost, and whose key paid - then rolled up by model, team, and person. Budgets stop hard at the cap, and one switch pauses every model org-wide. This feature's true price: $2.41.",
    boundary: "Costs are recorded as the provider billed them - never estimated.",
    mood: "focused",
    says: "That feature cost $2.41. Exactly.",
    station: { role: "admin", stamp: "On the ledger", tone: "ok" },
    baton: { status: "Done", pill: "done", cost: "$2.41" },
  },
  {
    id: "cta",
    kicker: "Your turn",
    headline: "Your org next.",
    sub: "Your repos became one living map, a question became a plan, and your team and your agents shipped it - gated, attributed, and on the bill. That's the product. Free to start.",
    boundary: "You hold every gate - the plan, the change, the merge.",
    mood: "happy",
    says: "Ready when you are.",
    station: { role: null, stamp: "Free to start", tone: "go" },
    baton: { status: "Shipped", pill: "done", cost: "$2.41" },
  },
] as const;

/** Hero copy - the front page above the film. */
export const HERO = {
  kicker: "Meet Athena",
  headline_pre: "The ",
  headline_accent: "context engine",
  headline_post: " between your code, teams, and AI.",
  sub: "Athena sits between your code, your team, and any AI agent. It holds shared knowledge of every repo, decision, and convention, grounds the AI, gates every change by your team, and meters every dollar of AI spend by feature, team, and project. Your coding agents plug straight in - and get all of it.",
} as const;

/** What you get, in plain words - shown under the hero. Deliberately NOT
 *  numbers: connector/tool/provider counts all grow with the product, so the
 *  page never pins them. Every line is a shipped capability. */
export const CAPABILITIES: readonly string[] = [
  "All your repos, one shared brain",
  "Answers with sources, for anyone",
  "Your coding agents plug in",
  "Build and share your own agents",
  "Ask from Slack, share the thread",
  "Every AI dollar on one bill",
] as const;
