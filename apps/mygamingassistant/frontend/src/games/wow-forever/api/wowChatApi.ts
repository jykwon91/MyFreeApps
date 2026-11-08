import api from "@/lib/api";
import { CHAT_TURN_URL } from "@/games/wow-forever/data/ask/askChatWire";
import { ASK_LIMITS } from "@/games/wow-forever/data/ask/askLimits";
import type { ChatTurnRequest } from "@/games/wow-forever/types/ask/chatTurnRequest";
import type { ChatTurnResponse } from "@/games/wow-forever/types/ask/chatTurnResponse";

/**
 * One call to the "Ask" chat relay (`POST /api/wow/chat/turn`). Not an RTK
 * mutation: the chat needs Retry-After on a 429 and a real abort (Cancel),
 * which the shared base query doesn't pass through. A new question carries a
 * fresh single-use Turnstile token; tool results carry the ticket instead.
 * Rejects with the axios error.
 */
export async function sendChatTurn(
  body: ChatTurnRequest,
  turnstileToken: string,
  signal: AbortSignal,
): Promise<ChatTurnResponse> {
  const headers: Record<string, string> = turnstileToken === "" ? {} : { "X-Turnstile-Token": turnstileToken };
  const response = await api.post<ChatTurnResponse>(CHAT_TURN_URL, body, {
    headers,
    signal,
    timeout: ASK_LIMITS.requestTimeoutMs,
  });
  return response.data;
}
