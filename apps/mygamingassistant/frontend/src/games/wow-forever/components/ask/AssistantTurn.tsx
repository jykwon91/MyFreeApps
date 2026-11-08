import AskFollowUps from "@/games/wow-forever/components/ask/AskFollowUps";
import AskCardView from "@/games/wow-forever/components/ask/cards/AskCardView";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";
import type { AskTurnView } from "@/games/wow-forever/types/ask/askTurnView";

interface AssistantTurnProps {
  turn: AskTurnView;
  tools: AskToolDataState;
}

/** Claude's answer to one question: its text (plain, never HTML), then the cards its lookups made. */
export default function AssistantTurn({ turn, tools }: AssistantTurnProps) {
  if (turn.answer === "" && turn.cards.length === 0) return null;
  return (
    <div className="space-y-3" data-testid="ask-answer">
      {turn.answer ? (
        <p className="whitespace-pre-wrap break-words text-sm">
          <span className="sr-only">{ASK_COPY.assistant}: </span>
          {turn.answer}
        </p>
      ) : null}
      {turn.cards.map(({ id, card }) => (
        <AskCardView key={id} card={card} tools={tools} />
      ))}
      <AskFollowUps answer={turn.answer} />
    </div>
  );
}
