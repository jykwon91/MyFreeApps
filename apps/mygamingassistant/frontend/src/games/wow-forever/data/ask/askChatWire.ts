/** Values on the wire of `POST /api/wow/chat/turn` (the backend's `app/core/wow_chat_enums.py`). */
export const CHAT_ROLE = { user: "user", assistant: "assistant" } as const;

export const CHAT_BLOCK = { text: "text", toolUse: "tool_use", toolResult: "tool_result" } as const;

export const CHAT_STOP = {
  endTurn: "end_turn",
  toolUse: "tool_use",
  maxTokens: "max_tokens",
  refusal: "refusal",
} as const;

export const CHAT_TURN_URL = "/wow/chat/turn";
/** The Turnstile widget action the relay checks new messages for (`WOW_CHAT_TURNSTILE_ACTION`). */
export const CHAT_TURNSTILE_ACTION = "wow-chat";
