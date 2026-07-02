import { useEffect, useRef } from "react";
import { timeAgo } from "@platform/ui";
import type { RefinementTurn } from "@/types/resume-refinement/refinement-turn";

interface ConversationHistoryProps {
  turns: RefinementTurn[];
  /** Optimistic echo of a just-sent composer message — rendered as a
   *  user bubble + assistant thinking bubble until the real turn rows
   *  arrive from the poll/mutation (the owner clears it on
   *  turn_count advance, NOT on promise resolution, to avoid a
   *  disappear/reappear flicker). */
  pendingUserEcho?: { text: string } | null;
}

type Item =
  | { kind: "divider"; section: string }
  | { kind: "turn"; turn: RefinementTurn };

/**
 * Chat-style transcript of every previous turn in the refinement session.
 *
 * Standard chat layout: user bubbles right, AI bubbles left, max-width
 * constrained, distinct fills, "flat corner" toward the speaker side. A
 * thin labeled divider marks transitions between target sections so the
 * history reads as grouped chapters rather than one undifferentiated stream.
 *
 * Auto-scrolls to the latest turn on every length change AND when the
 * optimistic echo appears — otherwise a sent message can render
 * off-screen until the real turn lands.
 */
export default function ConversationHistory({
  turns,
  pendingUserEcho = null,
}: ConversationHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const echoText = pendingUserEcho?.text ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, echoText]);

  const items = buildItems(turns);
  if (items.length === 0 && !pendingUserEcho) return null;

  return (
    <section
      className="flex flex-col gap-1.5"
      aria-label="Refinement conversation history"
    >
      <ol role="list" aria-label="Conversation turns" className="flex flex-col gap-1.5">
        {items.map((item, idx) =>
          item.kind === "divider" ? (
            <SectionDivider key={`divider-${idx}-${item.section}`} section={item.section} />
          ) : (
            <ConversationBubble key={item.turn.id} turn={item.turn} />
          ),
        )}
        {pendingUserEcho && <PendingEchoBubbles text={pendingUserEcho.text} />}
      </ol>
      <div ref={bottomRef} aria-hidden />
    </section>
  );
}

interface PendingEchoBubblesProps {
  text: string;
}

// Optimistic pair: the user's just-sent message (same markup as a real
// user turn) plus an assistant thinking indicator until the proposal
// lands. role="status" aria-live="polite" matches the app's existing
// convention (VerdictBanner, DiscoveredJobCard).
function PendingEchoBubbles({ text }: PendingEchoBubblesProps) {
  return (
    <>
      <li className="flex justify-end">
        <div className="max-w-[85%] sm:max-w-[80%] flex flex-col">
          <div className="rounded-2xl rounded-tr-sm bg-primary/10 border border-primary/20 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words">
            <span className="sr-only">You said: </span>
            {text}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 text-right pr-1">
            sending…
          </p>
        </div>
      </li>
      <li className="flex justify-start">
        <div className="max-w-[85%] sm:max-w-[80%]">
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl rounded-tl-sm bg-muted/50 border border-border px-3 py-2 text-sm text-muted-foreground"
          >
            Hmm, let me think. Working on a suggestion…
          </div>
        </div>
      </li>
    </>
  );
}

interface ConversationBubbleProps {
  turn: RefinementTurn;
}

function ConversationBubble({ turn }: ConversationBubbleProps) {
  const body = renderTurnBody(turn);
  if (body === null) return null;

  const isUser = isUserRole(turn.role);
  const wrapperClass = isUser ? "flex justify-end" : "flex justify-start";
  const bubbleClass = isUser
    ? "rounded-2xl rounded-tr-sm bg-primary/10 border border-primary/20 px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words"
    : "rounded-2xl rounded-tl-sm bg-muted/50 border border-border px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words";
  const subtitleClass = isUser
    ? "text-[10px] text-muted-foreground mt-0.5 text-right pr-1"
    : "text-[10px] text-muted-foreground mt-0.5 pl-1";
  const sayLabel = isUser ? "You said: " : "Assistant said: ";

  return (
    <li className={wrapperClass}>
      <div className="max-w-[85%] sm:max-w-[80%] flex flex-col">
        <div className={bubbleClass}>
          <span className="sr-only">{sayLabel}</span>
          {body}
        </div>
        <p className={subtitleClass}>{timeAgo(turn.created_at)}</p>
      </div>
    </li>
  );
}

interface SectionDividerProps {
  section: string;
}

function SectionDivider({ section }: SectionDividerProps) {
  return (
    <li role="presentation" aria-hidden="true" className="flex items-center gap-2 py-1">
      <span className="flex-1 h-px bg-border" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0">
        {section}
      </span>
      <span className="flex-1 h-px bg-border" />
    </li>
  );
}

function isUserRole(role: RefinementTurn["role"]): boolean {
  return (
    role === "user_accept" ||
    role === "user_accept_flagged" ||
    role === "user_custom" ||
    role === "user_request_alternative" ||
    role === "user_skip"
  );
}

function buildItems(turns: RefinementTurn[]): Item[] {
  const out: Item[] = [];
  let lastSection: string | null = null;
  for (const turn of turns) {
    if (turn.role === "session_complete") continue;
    if (renderTurnBody(turn) === null) continue;
    if (turn.target_section && turn.target_section !== lastSection) {
      out.push({ kind: "divider", section: turn.target_section });
      lastSection = turn.target_section;
    }
    out.push({ kind: "turn", turn });
  }
  return out;
}

function renderTurnBody(turn: RefinementTurn): string | null {
  switch (turn.role) {
    case "ai_critique":
      return turn.rationale ?? "Initial review complete.";
    case "ai_proposal":
      if (turn.clarifying_question) return turn.clarifying_question;
      if (turn.proposed_text) return turn.proposed_text;
      return null;
    case "user_accept":
      return turn.proposed_text
        ? `Accepted: ${turn.proposed_text}`
        : "Accepted this suggestion.";
    case "user_accept_flagged":
      return turn.proposed_text
        ? `Accepted (confirmed accurate): ${turn.proposed_text}`
        : "Accepted this suggestion after confirming the details.";
    case "user_custom":
      return turn.user_text ?? "Submitted a custom rewrite.";
    case "user_request_alternative":
      // The user's own words, rendered as plain chat text — the old
      // "Try something with: …" prefix mislabeled clarify answers as
      // reroll hints (operator complaint, 2026-07-02).
      return turn.user_text ?? "Asked for another take.";
    case "user_skip":
      return "Skipped.";
    case "session_complete":
      return null;
    default:
      return null;
  }
}
