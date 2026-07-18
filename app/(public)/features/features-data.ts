/**
 * Feature-page data, told as a STORY rather than a flat catalog.
 *
 * The arc runs Learn -> Ask -> Connect -> Do -> Automate -> Cost -> Trust ->
 * Connect-your-stack -> Build-on-Athena. Each chapter carries the meaning in a
 * plain headline and one sentence; the individual features are skimmable
 * supporting detail under light sub-labels. Every line is plain language anyone
 * can read (not just engineers) and is grounded in a real, shipped capability.
 * `accent` is the substring of `title` rendered in the brand gradient; `icon` is
 * a lucide-react name resolved in the page. No exact feature counts anywhere.
 */

export interface StorySection {
  label: string;
  features: string[];
}

export interface Chapter {
  n: string;
  kicker: string;
  title: string;
  accent: string;
  narrative: string;
  icon: string;
  sections: StorySection[];
}

export const STORY: Chapter[] = [
  {
    n: "01",
    kicker: "The foundation",
    title: "It learns how your company is built",
    accent: "how your company is built",
    narrative: "Athena builds one living map of your whole company that keeps itself up to date.",
    icon: "Telescope",
    sections: [
      {
        label: "The living map",
        features: [
          "See how your whole company is built, in one place",
          "Zoom from the big picture down to a single project",
          "Always fresh, with clear flags when something is out of date",
          "One source of truth everyone can trust",
        ],
      },
      {
        label: "Docs that keep themselves honest",
        features: [
          "Documentation that updates itself as the work changes",
          "Athena suggests doc edits, and you approve them",
          "Approve every AI doc edit from one place",
          "Lock the sections that should never be auto-changed",
          "Plain-English summaries of what each file does",
        ],
      },
    ],
  },
  {
    n: "02",
    kicker: "Answers on tap",
    title: "Ask anything and get a real answer",
    accent: "get a real answer",
    narrative: "Ask a question in plain words and get a cited answer from across every project.",
    icon: "Search",
    sections: [
      {
        label: "Just ask",
        features: [
          "Ask across every project and get answers with sources",
          "Find where anything lives in seconds",
          "Answers appear as they're written, no waiting",
          "Dial up deeper thinking for hard questions",
          "Add live web search when you need it",
          "Attach a file or screenshot to ask about it",
          "Turn a chat answer straight into a task",
          "Ask about the page you're looking at, right there",
        ],
      },
      {
        label: "Onboarding made easy",
        features: [
          "New hires get up to speed without bugging seniors",
          "A shared glossary so everyone speaks the same language",
        ],
      },
    ],
  },
  {
    n: "03",
    kicker: "The big picture",
    title: "See how everything connects",
    accent: "how everything connects",
    narrative: "Understand what depends on what before you change it, and stop re-arguing settled calls.",
    icon: "Network",
    sections: [
      {
        label: "Dependencies",
        features: [
          "See how your projects connect to each other",
          "Know what a change will affect before you make it",
          "See who depends on your work",
          "Trace a feature from the front end to the back end",
        ],
      },
      {
        label: "Decisions that stick",
        features: [
          "A history of why things were decided",
          "Keep conventions and team notes everyone can find",
          "Get warned when a past decision goes stale",
          "Stop re-arguing questions you already settled",
        ],
      },
    ],
  },
  {
    n: "04",
    kicker: "Real work",
    title: "Get work done, with people in control",
    accent: "with people in control",
    narrative: "Work moves through the right steps, and a human signs off before anything ships.",
    icon: "ListChecks",
    sections: [
      {
        label: "Work that organizes itself",
        features: [
          "One inbox of exactly what needs you",
          "See what's ready to start and what's blocked",
          "Work lined up in the right order automatically",
          "Track features, bugs, designs, and chores together",
          "View work as a board, a tree, or a timeline",
        ],
      },
      {
        label: "You hold the gate",
        features: [
          "Review exactly what changed before any pull request",
          "Approve it or send it back with a note",
          "Roll back to an earlier version anytime",
          "Decide who is allowed to approve",
        ],
      },
    ],
  },
  {
    n: "05",
    kicker: "AI that does the work",
    title: "Put AI agents to work on your board",
    accent: "Put AI agents to work",
    narrative: "Hand tasks to any coding agent; it works from your knowledge and the latest code, and can never ship on its own.",
    icon: "Workflow",
    sections: [
      {
        label: "Agents that actually help",
        features: [
          "Put any coding assistant straight onto your board",
          "Every agent is briefed with your company's knowledge",
          "Agents always work against the latest code",
          "Out-of-date work is caught and rejected",
          "See which agent did what, step by step",
        ],
      },
      {
        label: "Always under control",
        features: [
          "Agents can never approve or ship by themselves",
          "Two agents never collide on the same work",
          "Stop a runaway agent with one click",
        ],
      },
    ],
  },
  {
    n: "06",
    kicker: "Money in view",
    title: "See and control what AI costs",
    accent: "control what AI costs",
    narrative: "Know the cost of every feature and stop overspending before it happens.",
    icon: "Coins",
    sections: [
      {
        label: "Know the cost",
        features: [
          "See cost per feature, task, and project",
          "Break spend down by area, person, or provider",
          "See savings, retries, and speed next to cost",
          "See the cost of keeping each project's knowledge fresh",
          "See who's paying: your own keys or Athena credit",
          "Export cost reports for finance",
        ],
      },
      {
        label: "Stay in budget",
        features: [
          "Set budgets that stop spend before it overruns",
          "Get warned before a budget is blown",
          "A kill switch to halt all spend instantly",
        ],
      },
    ],
  },
  {
    n: "07",
    kicker: "Trust by design",
    title: "Safe, private, and governed",
    accent: "Safe, private, and governed",
    narrative: "Fine-grained roles, encrypted keys, and a tamper-proof trail keep your data yours.",
    icon: "ShieldCheck",
    sections: [
      {
        label: "Who can do what",
        features: [
          "Build your own roles from scratch, nothing hardcoded",
          "Give people access only to their own area",
          "Removing someone instantly cuts off their access",
          "Review and sign out your active devices",
          "Sign in with your existing company login and passkeys",
        ],
      },
      {
        label: "Your data, protected",
        features: [
          "Each customer's data stays fully walled off",
          "Choose what's hidden before anything reaches a model",
          "Set how long each kind of data is kept",
          "API keys stored encrypted, never shown again",
          "Incoming updates are checked as genuine before they're trusted",
          "A tamper-proof record of everything that happened",
          "Retire an org safely, with a recovery window",
        ],
      },
    ],
  },
  {
    n: "08",
    kicker: "Your whole stack",
    title: "Connect every tool you already use",
    accent: "every tool you already use",
    narrative: "Connect your tools in one click, and let any agent safely use any tool through Athena.",
    icon: "Plug",
    sections: [
      {
        label: "One-click connectors",
        features: [
          "Connect GitHub, GitLab, and Bitbucket",
          "Connect Jira, Linear, Asana, and Azure DevOps",
          "Connect Confluence, Notion, and Figma",
          "Ask Athena right inside Slack and get a cited reply",
          "Reconnect or disconnect any tool anytime",
        ],
      },
      {
        label: "One hub for every AI tool",
        features: [
          "Connect any outside tool once and let your agents use it",
          "Connecting a tool lights up its built-in agent tools instantly",
          "Plug in your own private internal tools too",
          "Pick exactly which tools agents may use",
          "Reads are easy; writes need approval you control",
          "Get flagged when a connected tool's features change",
          "Flaky connections fail safe instead of cascading",
        ],
      },
      {
        label: "Pick your AI",
        features: [
          "Choose from many AI providers or bring your own key",
          "Use your personal Claude or ChatGPT plan, never pooled",
          "Pick a different model for different jobs",
        ],
      },
    ],
  },
  {
    n: "09",
    kicker: "Make it yours",
    title: "Build on top of Athena",
    accent: "Build on top of Athena",
    narrative: "Build your own agents and design systems, teach Athena your standards, run AI on your own machine, and turn your knowledge into your own products.",
    icon: "Blocks",
    sections: [
      {
        label: "Build your own AI agents and tools",
        features: [
          "Build an agent with a guided builder, no prompt engineering needed",
          "Or describe what you want and let AI draft the whole agent",
          "Give each agent only the tools its job needs, never more",
          "Wrap your own APIs or connected tools for an agent to call",
          "Give an agent memory and pick the model it runs on",
          "Share an agent with a team, or keep it to yourself",
        ],
      },
      {
        label: "Your design system, one source of truth",
        features: [
          "Keep your design tokens as one reusable system",
          "Generate a system from a prompt, or pull it from your code",
          "Edit colors, spacing, and type with a live preview",
          "Assign a system to a team so its design work stays on brand",
        ],
      },
      {
        label: "Skills your whole team shares",
        features: [
          "Write a standard once and share it across the org",
          "Bring in rules you already wrote for other AI tools",
          "Attach a skill to the right teams and stages",
          "Draft, activate, or archive a skill anytime",
          "Every agent applies your standards automatically",
          "See how often each skill is actually used",
        ],
      },
      {
        label: "Athena Desktop for local tools",
        features: [
          "A desktop app that drives the coding tools on your machine",
          "Install on Windows, Mac, or Linux",
          "Run a task locally on your own AI plan, free of org credit",
          "Your local agent already knows your codebase",
          "Approve every file write and command before it runs",
          "The AI is boxed into the task's own folder, nothing more",
          "A built-in terminal for builds, tests, and git",
          "An emergency stop halts all local AI at once",
          "A private, on-device log of everything the AI did",
          "Uses the tools you already have, installs nothing extra",
        ],
      },
      {
        label: "Build on the knowledge API",
        features: [
          "Query your org's knowledge from your own products",
          "Ask Athena for a grounded answer over the API",
          "Mint scoped access keys for CI and outside tools",
          "Embed finished docs and blueprints in your own pages",
          "Showcase how Athena understands a repo, no login needed",
        ],
      },
    ],
  },
];
