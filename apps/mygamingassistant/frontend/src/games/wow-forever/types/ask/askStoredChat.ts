import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";

/** The chat kept in sessionStorage: the conversation and each tool call's card, by tool-use id. */
export interface AskStoredChat {
  messages: ChatMessage[];
  cards: Record<string, AskCard>;
}
