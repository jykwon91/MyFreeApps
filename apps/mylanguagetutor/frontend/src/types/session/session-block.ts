/**
 * Why the learner can't send another turn right now (not an error to retry).
 * - ``daily_limit``: today's practice budget is used up
 * - ``unavailable``: the tutor is switched off for everyone
 * - ``session_limit``: this conversation reached its turn limit
 * - ``session_ended``: the conversation was ended
 */
export type SessionBlock = "daily_limit" | "unavailable" | "session_limit" | "session_ended";
