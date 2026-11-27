import type { PastRulePrompt } from "./past-rule-prompt";

/** What useApplyRuleToPast gives its callers. */
export interface ApplyRuleToPast {
  prompt: PastRulePrompt | null;
  /** The rule whose past payments are being counted, so its button can show it's working. */
  checkingRuleId: string | null;
  isApplying: boolean;
  /**
   * Count the past payments the rule would refile and, when there are any, ask before
   * filing them. Resolves once the question is answered, or at once when there's nothing to ask.
   */
  offer: (rule: { id: string; match_pattern: string }, options?: { quietWhenNone?: boolean }) => Promise<void>;
  confirm: () => Promise<void>;
  dismiss: () => void;
}
