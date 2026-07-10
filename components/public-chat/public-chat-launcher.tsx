"use client";

/**
 * Floating "Ask Athena" launcher mounted on every public showcase page.
 *
 * A small floating input (the "chat box") that, on submit, opens a slide-in
 * panel and answers there - the requested UX. Owns the single chat turn engine
 * + open state, and derives the repo scope from the URL: on `/showcase/<repo>`
 * the chat is pinned to that repo; anywhere else under (public) it spans the
 * whole showcase.
 */

import { ArrowUp } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import { OwlAvatar } from "@/components/mascot/owl-avatar";
import { PublicChatPanel } from "@/components/public-chat/public-chat-panel";
import { focusRing } from "@/components/ui/focus";
import { cn } from "@/lib/cn";
import { usePublicChatTurn } from "@/features/public-chat/use-public-chat-turn";

const REPO_SUGGESTIONS = [
  "What does this repository do?",
  "Walk me through the architecture",
  "What are the main components?",
];
const INDEX_SUGGESTIONS = [
  "What is Athena?",
  "Which repositories can I explore here?",
  "How does Athena understand a codebase?",
];

export function PublicChatLauncher() {
  const pathname = usePathname() || "";
  const repoSlug = useMemo(() => {
    const m = /^\/showcase\/([^/]+)/.exec(pathname);
    return m && m[1] ? decodeURIComponent(m[1]) : null;
  }, [pathname]);

  const turn = usePublicChatTurn(repoSlug);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const scopeLabel = repoSlug ? repoSlug : "All showcase repositories";
  const suggestions = repoSlug ? REPO_SUGGESTIONS : INDEX_SUGGESTIONS;

  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    setDraft("");
    setOpen(true);
    turn.send(q);
  };

  const sendSuggestion = (text: string) => {
    setOpen(true);
    turn.send(text);
  };

  return (
    <>
      {/* Collapsed floating chat box (hidden while the panel is open). */}
      <div
        className={cn(
          "fixed bottom-4 right-4 z-[var(--z-chrome)] transition-all duration-200 ease-out motion-reduce:transition-none",
          open ? "pointer-events-none translate-y-2 opacity-0" : "opacity-100",
        )}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="glass-panel flex items-center gap-2 !rounded-full py-1.5 pl-3 pr-1.5"
        >
          <OwlAvatar size={18} mood="happy" static className="shrink-0" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => {
              if (turn.messages.length > 0) setOpen(true);
            }}
            placeholder="Ask Athena about showcase repos"
            aria-label="Ask Athena about showcase repos"
            className="w-44 bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] sm:w-56"
          />
          <button
            type="submit"
            aria-label="Send"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-fg)] disabled:opacity-40",
              focusRing,
            )}
            disabled={!draft.trim()}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
      </div>

      <PublicChatPanel
        open={open}
        onClose={() => setOpen(false)}
        scopeLabel={scopeLabel}
        suggestions={suggestions}
        messages={turn.messages}
        streaming={turn.streaming}
        sending={turn.sending}
        error={turn.error}
        draft={draft}
        onDraft={setDraft}
        onSend={submit}
        onStop={turn.abort}
        onSuggestion={sendSuggestion}
      />
    </>
  );
}
