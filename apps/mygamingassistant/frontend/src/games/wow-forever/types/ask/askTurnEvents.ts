import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";
import type { ChatToolUseBlock } from "@/games/wow-forever/types/ask/chatToolUseBlock";

/** What the turn loop reports while it runs, so the page can show the conversation and step lines as they grow. */
export interface AskTurnEvents {
  onMessages: (messages: ChatMessage[]) => void;
  onCard: (toolUseId: string, card: AskCard) => void;
  onToolCalls: (calls: readonly ChatToolUseBlock[]) => void;
}
