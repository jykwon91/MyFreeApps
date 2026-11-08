/** What the chat is doing right now. */
export const ASK_PHASE = {
  idle: "idle",
  /** Waiting for the human check before the question can go. */
  checking: "checking",
  /** Waiting for Claude. */
  thinking: "thinking",
  /** Running Claude's tool calls on this page. */
  tools: "tools",
} as const;
