import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import type { RefinementTurn } from "@/types/resume-refinement/refinement-turn";

interface ConversationHistoryProps {
  turns: RefinementTurn[];
}

/**
 * Chat-style transcript of every previous turn in the refinement session.
 *
 * Renders oldest → newest top-to-bottom. Auto-scrolls to the bottom on every
 * new turn so the latest exchange is always visible. ``ai_proposal`` and
 * ``user_request_alternative`` turns where the user is still acting on the
 * CURRENT target are intentionally not duplicated here — those are owned by
 * the active suggestion panel below the history.
 */
export default function ConversationHistory({ turns }: ConversationHistoryProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length]);

  const visible = turns.filter(isHistoricalTurn);
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3" aria-label="Refinement conversation history">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conversation
      </h2>
      <ol className="space-y-3">
        {visible.map((turn) => (
          <ConversationBubble key={turn.id} turn={turn} />
        ))}
      </ol>
      <div ref={bottomRef} aria-hidden />
    </section>
  );
}

interface ConversationBubbleProps {
  turn: RefinementTurn;
}

function ConversationBubble({ turn }: ConversationBubbleProps) {
  const isAi = turn.role === "ai_critique" || turn.role === "ai_proposal";
  const Icon = isAi ? Bot : User;
  const speaker = isAi ? "AI" : "You";
  const body = renderTurnBody(turn);
  if (body === null) return null;

  return (
    <li
      className={
        isAi
          ? "rounded-md border border-border bg-muted/40 p-3"
          : "rounded-md border border-primary/30 bg-primary/5 p-3"
      }
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5">
        <Icon className="size-3.5" />
        <span>{speaker}</span>
        {turn.target_section ? (
          <span className="font-normal text-muted-foreground">
            · {turn.target_section}
          </span>
        ) : null}
      </div>
      <div className="text-sm whitespace-pre-wrap break-words">{body}</div>
    </li>
  );
}

function isHistoricalTurn(turn: RefinementTurn): boolean {
  // Skip session_complete (terminal marker — the CompletePanel renders that
  // state) and ai_proposal/user_request_alternative for the CURRENT target
  // (owned by the active panel). The simplest filter that covers both: keep
  // anything except session_complete; the active panel's pending_proposal
  // is rendered separately and the in-flight request_alternative turn for
  // the current target also has a corresponding ai_proposal that follows.
  return turn.role !== "session_complete";
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
        : "Accepted the suggestion.";
    case "user_custom":
      return turn.user_text ?? "Submitted a custom rewrite.";
    case "user_request_alternative":
      return turn.user_text
        ? `Asked for another option: ${turn.user_text}`
        : "Asked for another option.";
    case "user_skip":
      return "Skipped this section.";
    case "session_complete":
      return null;
    default:
      return null;
  }
}
