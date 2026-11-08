import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import AskStepLines from "@/games/wow-forever/components/ask/AskStepLines";
import AssistantTurn from "@/games/wow-forever/components/ask/AssistantTurn";
import UserBubble from "@/games/wow-forever/components/ask/UserBubble";
import type { AskChatState } from "@/games/wow-forever/types/ask/askChatState";
import type { AskToolDataState } from "@/games/wow-forever/types/ask/askToolDataState";

interface AskThreadProps {
  chat: AskChatState;
  tools: AskToolDataState;
}

/** The conversation: each question, its answer and cards; the one being answered shows its step lines. */
export default function AskThread({ chat, tools }: AskThreadProps) {
  return (
    <ol className="space-y-5" aria-label={ASK_COPY.conversation}>
      {chat.turns.map((turn) => (
        <li key={turn.key} className="space-y-3">
          <UserBubble question={turn.question} />
          <AssistantTurn turn={turn} tools={tools} />
          {turn.pending ? (
            <AskStepLines phase={chat.phase} steps={chat.steps} busySince={chat.busySince} onCancel={chat.cancel} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
