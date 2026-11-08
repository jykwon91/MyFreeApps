/** The relay's error `detail` codes the page routes on (`app/core/wow_chat_limits.py`). */
export const ASK_ERROR_DETAIL = {
  unavailable: "chat_unavailable",
  dailyLimit: "chat_daily_limit_reached",
  ipDailyLimit: "chat_ip_daily_limit_reached",
  upstreamBusy: "chat_upstream_busy",
  messageTooLong: "chat_message_too_long",
} as const;

/** Codes that mean this conversation can't go on: start a new chat. */
export const CHAT_OVER_DETAILS: ReadonlySet<string> = new Set([
  "chat_ticket_required",
  "chat_ticket_invalid",
  "chat_ticket_expired",
  "chat_tool_rounds_exhausted",
  "chat_conversation_too_long",
  "chat_too_many_messages",
  "chat_too_many_turns",
]);
