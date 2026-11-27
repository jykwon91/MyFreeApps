import { WRITE_RATE_LIMITED_MESSAGE } from "@mybookkeeper/api-client/constants/writeFailureMessages";
import { DEMO_WORKSPACE_REFUSED } from "@mybookkeeper/api-client/constants/demoRefusal";
import type { WriteFailure } from "@mybookkeeper/api-client/types/write/write-failure";

export const PAYEE_RULE_MESSAGES = {
  alwaysFileLabel: "Always file payments to this payee like this",
  alwaysFileHint: "I'll file new payments from them the same way, including the property or split.",
  saved: (payee: string) => `Got it! I'll file new payments from ${payee} like this.`,
  couldntSave: "I couldn't save that rule. Want to try again?",
  viewOnly: "You have view-only access, so I can't save rules.",
  couldntCount: "I couldn't check your past payments for that rule. Want to try again?",
  pastTitle: "File past payments too?",
  pastDescription: (count: number, payee: string) =>
    `I found ${count} past payment${count === 1 ? "" : "s"} from ${payee} that you haven't filed yourself. Want me to file ${count === 1 ? "it" : "them"} the same way? Payments you've edited stay as they are.`,
  pastConfirm: (count: number) => `File ${count} payment${count === 1 ? "" : "s"}`,
  pastSkip: "Not now",
  applied: (count: number, payee: string) => `Done! I filed ${count} past payment${count === 1 ? "" : "s"} from ${payee}.`,
  nothingToApply: (payee: string) => `Every past payment from ${payee} is already filed this way.`,
  couldntApply: "I couldn't file those past payments. Want to try again?",
  applyToPast: "Apply to past",
  applyToPastLabel: (payee: string) => `Apply the rule for ${payee} to past payments`,
  splitEvenly: (names: readonly string[]) => `Split evenly: ${names.join(", ")}`,
  unknownProperty: "Unknown property",
} as const;

const failed = (message: string): Record<Exclude<WriteFailure, "gone">, string> => ({
  viewOnly: PAYEE_RULE_MESSAGES.viewOnly,
  demo: DEMO_WORKSPACE_REFUSED,
  noResponse: message,
  conflict: message,
  invalid: message,
  serverError: message,
  other: message,
  rateLimited: WRITE_RATE_LIMITED_MESSAGE,
  tooLarge: message,
});

export const PAYEE_RULE_SAVE_FAILURE_MESSAGES = failed(PAYEE_RULE_MESSAGES.couldntSave);
export const PAYEE_RULE_APPLY_FAILURE_MESSAGES = failed(PAYEE_RULE_MESSAGES.couldntApply);
