import type { ChatMessage } from "@/games/wow-forever/types/ask/chatMessage";
import type { ChatStopReason } from "@/games/wow-forever/types/ask/chatStopReason";

/** `POST /api/wow/chat/turn` answer: Claude's reply and the ticket for sending its tool results back. */
export interface ChatTurnResponse {
  message: ChatMessage;
  stop_reason: ChatStopReason;
  ticket: string;
  /** Tool-result calls still allowed for this question. */
  rounds_left: number;
}
