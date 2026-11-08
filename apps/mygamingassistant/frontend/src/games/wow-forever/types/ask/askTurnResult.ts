import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";

/**
 * A finished question: the conversation, and the ticket the next question must
 * carry. `ticket` is null when the final reply had to be changed before keeping
 * it (its signed digest no longer matches), so the chat can't go on.
 */
export interface AskTurnResult {
  messages: ChatMessage[];
  ticket: string | null;
}
