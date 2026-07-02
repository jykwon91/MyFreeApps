import { timeAgo } from "@platform/ui";
import {
  isUserRole,
  renderTurnBody,
} from "@/features/resume_refinement/conversation-turn-render";
import type { RefinementTurn } from "@/types/resume-refinement/refinement-turn";

interface ConversationBubbleProps {
  turn: RefinementTurn;
}

// One transcript bubble: user bubbles right with a flat top-right
// corner, AI bubbles left with a flat top-left corner.
export default function ConversationBubble({ turn }: ConversationBubbleProps) {
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
