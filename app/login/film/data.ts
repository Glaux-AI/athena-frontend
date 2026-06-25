/**
 * Film data - the cast and the nine segments of the landing film.
 *
 * The film follows ONE feature through a whole team - YOUR team. No invented
 * people, no invented company: the stations on the workline are the roles
 * around the person watching (product, design, engineering, admin), and the
 * gates that matter most - the diff, the merge - belong to "you". AI does
 * the work between human decisions; the copy stays second-person so the
 * viewer is always in the frame.
 *
 * Every line is checked against what ships today. `stamp` is the human
 * moment that pops at the segment's station on the workline.
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
  | "foundation"
  | "stack"
  | "ask"
  | "prd"
  | "split"
  | "build"
  | "ship"
  | "receipt"
  | "cta";

export interface Segment {
  id: SceneKey;
  kicker: string;
  headline: string;
  sub: string;
  /** The honest one-liner - what Athena does / never does here. */
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
    id: "foundation",
    kicker: "The foundation",
    headline: "Athena reads your code.",
    sub: "Connect GitHub and pick the repos. Athena turns each one into a Blueprint - what it does, how it's built, how it connects - one living map for the whole org.",
    boundary: "Read-only access you grant repo by repo. Notes live in Athena, never in your code.",
    mood: "reading",
    says: "Twelve repos. I know this codebase now.",
    station: { role: null, stamp: "12 repos · synced", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "stack",
    kicker: "The stack",
    headline: "Your stack plugs in.",
    sub: "Jira, Linear, and Slack add context. Any of 14 AI providers run the models - your keys or Athena credit. And your rules, skills, and MCP servers become tools every run can use.",
    boundary: "All optional - source control alone is enough to start.",
    mood: "focused",
    says: "Wired in. Your keys stay yours.",
    station: { role: "admin", stamp: "Stack connected", tone: "ok" },
    baton: { status: "", pill: "idle", cost: "" },
  },
  {
    id: "ask",
    kicker: "The question",
    headline: "It starts with a question.",
    sub: "Anyone on the team can ask, in plain language. The answer streams back with citations into the real code - and one click turns it into a feature request.",
    boundary: "No citation, no claim. Chat reads the codebase; it never edits it.",
    mood: "focused",
    says: "Found it - charge.py, line 84.",
    station: { role: "pm", stamp: "Proposed as a feature", tone: "go" },
    baton: { status: "Backlog", pill: "idle", cost: "$0.03" },
  },
  {
    id: "prd",
    kicker: "The draft",
    headline: "Athena drafts. A human approves.",
    sub: "Frame, research, PRD - written from org knowledge, every claim cited, every step logged. Then the run stops at a hard gate and waits for a yes.",
    boundary: "Hard gates cannot be skipped - not by Athena, not by any model.",
    mood: "writing",
    says: "PRD's ready. Over to your lead.",
    station: { role: "lead", stamp: "PRD approved", tone: "ok" },
    baton: { status: "In progress", pill: "running", cost: "$0.47" },
  },
  {
    id: "split",
    kicker: "The split",
    headline: "One task becomes many.",
    sub: "Any task can break into subtasks of any type - implementation, design, chores. Athena decides the breakdown and the order they must land in; your lead approves the plan. Only then are they created.",
    boundary: "The plan is reviewable before anything spawns. The model never invents its own process.",
    mood: "thinking",
    says: "Four subtasks. Two can run in parallel.",
    station: { role: "lead", stamp: "Plan approved", tone: "ok" },
    baton: { status: "Decomposed", pill: "running", cost: "$0.61" },
  },
  {
    id: "build",
    kicker: "The build",
    headline: "Everyone builds in parallel.",
    sub: "The subtasks hit the board and your team picks them up - design in one, a teammate's Cursor in another, Athena running a third. Blocked work waits for its dependencies. And the diff comes to you, line by line, before any PR exists.",
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
    boundary: "It lands as a draft PR on your repo - your reviews and branch rules apply.",
    mood: "happy",
    says: "Checks green. Over to you.",
    station: { role: "you", stamp: "Merged by you", tone: "go" },
    baton: { status: "In review", pill: "review", cost: "$2.28" },
  },
  {
    id: "receipt",
    kicker: "The receipt",
    headline: "Every token, on the ledger.",
    sub: "Every call is metered - model, tokens, cost, and whose key paid - then rolled up by model, team, and person. Budgets stop hard at the cap. This feature's true price: $2.41.",
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
    sub: "A question became a cited answer, a PRD, parallel subtasks, a reviewed diff, and a merged PR - your team deciding at every gate. That's the product. Free to start.",
    boundary: "You hold every gate - the plan, the diff, the merge.",
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
  sub: "Athena sits between your code, your team, and any AI agent. It holds shared knowledge of every repo, decision, and convention, grounds the AI, gates every change by your team, and meters every dollar of AI spend by feature, team, and project.",
} as const;
