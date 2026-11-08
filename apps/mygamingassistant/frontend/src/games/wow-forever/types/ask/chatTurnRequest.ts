import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";

/** `POST /api/wow/chat/turn` body: the whole conversation, plus the last reply's ticket when sending tool results. */
export interface ChatTurnRequest {
  messages: ChatMessage[];
  ticket?: string;
}
