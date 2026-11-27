import { useRef, useState } from "react";
import {
  useApplyRuleToPastMutation,
  useLazyGetRulePastMatchesQuery,
} from "@mybookkeeper/api-client/store/classificationRulesApi";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { showError, showSuccess } from "@platform/ui";
import { PAYEE_RULE_APPLY_FAILURE_MESSAGES, PAYEE_RULE_MESSAGES as MSG } from "@/shared/lib/payee-rule-messages";
import type { ApplyRuleToPast } from "@/shared/types/classification-rule/apply-rule-to-past";
import type { PastRulePrompt } from "@/shared/types/classification-rule/past-rule-prompt";

/** "Apply to past payments" with a count to confirm first: shared by the rules panel and the transaction panel. */
export function useApplyRuleToPast(): ApplyRuleToPast {
  const [countPastMatches] = useLazyGetRulePastMatchesQuery();
  const [applyRuleToPast, { isLoading: isApplying }] = useApplyRuleToPastMutation();
  const [prompt, setPrompt] = useState<PastRulePrompt | null>(null);
  const [checkingRuleId, setCheckingRuleId] = useState<string | null>(null);
  const answered = useRef<(() => void) | null>(null);
  // isApplying turns true a render after the click; a second click in that gap would apply twice.
  const applying = useRef(false);

  function settle() {
    setPrompt(null);
    answered.current?.();
    answered.current = null;
  }

  async function offer(rule: { id: string; match_pattern: string }, options: { quietWhenNone?: boolean } = {}) {
    setCheckingRuleId(rule.id);
    let count: number;
    try {
      count = (await countPastMatches(rule.id).unwrap()).count;
    } catch {
      showError(MSG.couldntCount);
      return;
    } finally {
      setCheckingRuleId(null);
    }
    if (count === 0) {
      if (!options.quietWhenNone) showSuccess(MSG.nothingToApply(rule.match_pattern));
      return;
    }
    await new Promise<void>((resolve) => {
      answered.current = resolve;
      setPrompt({ ruleId: rule.id, payee: rule.match_pattern, count });
    });
  }

  async function confirm() {
    if (prompt === null || applying.current) return;
    applying.current = true;
    try {
      const { applied } = await applyRuleToPast(prompt.ruleId).unwrap();
      showSuccess(MSG.applied(applied, prompt.payee));
      settle();
    } catch (error) {
      const failure = writeFailure(error);
      showError(failure === "gone" ? MSG.couldntApply : PAYEE_RULE_APPLY_FAILURE_MESSAGES[failure]);
      if (failure === "gone" || failure === "viewOnly" || failure === "demo") settle();
    } finally {
      applying.current = false;
    }
  }

  function dismiss() {
    if (!applying.current) settle();
  }

  return { prompt, checkingRuleId, isApplying, offer, confirm, dismiss };
}
