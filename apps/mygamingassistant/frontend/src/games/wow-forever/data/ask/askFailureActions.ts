import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import type { AskFailureKind } from "@/games/wow-forever/types/ask/askFailureKind";

/** What a failure notice offers. */
export const ASK_FAILURE_ACTION = {
  retry: "retry",
  newChat: "newChat",
  /** Nothing to press: wait (daily cap) or edit the question (too long — it's back in the box). */
  none: "none",
} as const;

export const ASK_FAILURE_ACTIONS: Readonly<Record<AskFailureKind, (typeof ASK_FAILURE_ACTION)[keyof typeof ASK_FAILURE_ACTION]>> = {
  [ASK_FAILURE.rateLimited]: ASK_FAILURE_ACTION.retry,
  [ASK_FAILURE.dailyLimit]: ASK_FAILURE_ACTION.none,
  [ASK_FAILURE.busy]: ASK_FAILURE_ACTION.retry,
  [ASK_FAILURE.unavailable]: ASK_FAILURE_ACTION.retry,
  [ASK_FAILURE.humanCheck]: ASK_FAILURE_ACTION.retry,
  [ASK_FAILURE.chatOver]: ASK_FAILURE_ACTION.newChat,
  [ASK_FAILURE.tooLong]: ASK_FAILURE_ACTION.none,
  [ASK_FAILURE.network]: ASK_FAILURE_ACTION.retry,
  [ASK_FAILURE.failed]: ASK_FAILURE_ACTION.retry,
};
