/** Client-side limits for the "Ask" chat. Kept at or under the relay's (`app/core/wow_chat_limits.py`). */
export const ASK_LIMITS = {
  /** The composer's counter; the relay allows 1,000. */
  questionMaxChars: 500,
  /** Questions per conversation (`USER_TURNS_MAX`). */
  questionsPerChat: 12,
  /** Messages in one request (`MESSAGES_MAX`). */
  messagesPerChat: 30,
  /** The most messages one question can add before its last call: itself + 3 tool rounds × (reply + results). */
  messagesPerQuestion: 7,
  /** A tool result Claude reads (`TOOL_RESULT_MAX_BYTES`). */
  toolResultMaxBytes: 4 * 1024,
  /** Rows on an NPC, place or item card. */
  cardRows: 5,
  /** Cards under one answer. */
  cardsPerTurn: 3,
  /** "Still working" shows after this long. */
  stillWorkingMs: 8000,
  /** One relay call; the server gives Claude 45 s. */
  requestTimeoutMs: 55_000,
  /** "Chat cleared — Undo" stays this long. */
  undoMs: 10_000,
} as const;

export const ASK_STORAGE_KEY = "mga.wowForever.ask.chat.v1";
/** The hub's ask box hands the question over in `?q=`; the page sends it once and drops it. */
export const ASK_QUERY_PARAM = "q";
export const ASK_PAGE_PATH = "/wow-forever/ask";
