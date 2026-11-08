/** Why a question got no answer — each has its own notice (`ASK_COPY.failure`). */
export const ASK_FAILURE = {
  rateLimited: "rateLimited",
  dailyLimit: "dailyLimit",
  busy: "busy",
  unavailable: "unavailable",
  humanCheck: "humanCheck",
  chatOver: "chatOver",
  tooLong: "tooLong",
  network: "network",
  failed: "failed",
} as const;
