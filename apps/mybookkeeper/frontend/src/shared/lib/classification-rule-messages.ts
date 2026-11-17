import { WRITE_RATE_LIMITED_MESSAGE } from "@mybookkeeper/api-client/constants/writeFailureMessages";
import { DEMO_WORKSPACE_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import type { WriteFailure } from "@mybookkeeper/api-client/types/write/write-failure";

export const CLASSIFICATION_RULE_MESSAGES = {
  deleted: "Rule deleted.",
  alreadyDeleted: "That rule was already deleted.",
  deleteDemo: DEMO_WORKSPACE_REFUSED,
  deleteViewOnly: "You have view-only access, so I can't delete rules.",
  couldntLoad: "I couldn't load your vendor rules.",
  deleteFailed: "I couldn't delete that rule. Want to try again?",
} as const;

export const CLASSIFICATION_RULE_DELETE_FAILURE_MESSAGES: Record<Exclude<WriteFailure, "gone">, string> = {
  viewOnly: CLASSIFICATION_RULE_MESSAGES.deleteViewOnly,
  demo: CLASSIFICATION_RULE_MESSAGES.deleteDemo,
  noResponse: CLASSIFICATION_RULE_MESSAGES.deleteFailed,
  conflict: CLASSIFICATION_RULE_MESSAGES.deleteFailed,
  invalid: CLASSIFICATION_RULE_MESSAGES.deleteFailed,
  serverError: CLASSIFICATION_RULE_MESSAGES.deleteFailed,
  other: CLASSIFICATION_RULE_MESSAGES.deleteFailed,
  rateLimited: WRITE_RATE_LIMITED_MESSAGE,
  tooLarge: CLASSIFICATION_RULE_MESSAGES.deleteFailed,
};

export const CLASSIFICATION_RULES_SKELETON_ROW_COUNT = 4;
