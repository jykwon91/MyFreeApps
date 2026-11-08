import type { AskCard } from "@/games/wow-forever/types/ask/askCard";
import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";

/**
 * The chat kept in sessionStorage: the conversation, each tool call's card by
 * tool-use id, and the ticket from the last finished answer (the next question
 * must send it; null for a new chat).
 */
export interface AskStoredChat {
  messages: ChatMessage[];
  cards: Record<string, AskCard>;
  ticket: string | null;
}
