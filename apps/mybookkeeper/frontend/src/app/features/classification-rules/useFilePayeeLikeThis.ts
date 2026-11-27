import { useCreateClassificationRuleMutation } from "@mybookkeeper/api-client/store/classificationRulesApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { writeFailure } from "@mybookkeeper/api-client/utils/writeFailure";
import { showError, showSuccess } from "@platform/ui";
import { PAYEE_RULE_MESSAGES as MSG, PAYEE_RULE_SAVE_FAILURE_MESSAGES } from "@/shared/lib/payee-rule-messages";
import type { FilePayeeLikeThis } from "@/shared/types/classification-rule/file-payee-like-this";
import { payeeRuleFromTransaction } from "@/shared/utils/payee-rule-from-transaction";
import { useApplyRuleToPast } from "./useApplyRuleToPast";

/**
 * "Always file payments to this payee like this": a payee rule from the row as saved,
 * then the offer to file the payee's past payments the same way.
 */
export function useFilePayeeLikeThis(): FilePayeeLikeThis {
  const [createRule, { isLoading: isSavingRule }] = useCreateClassificationRuleMutation();
  const applyToPast = useApplyRuleToPast();

  async function fileLikeThis(saved: Transaction) {
    const body = payeeRuleFromTransaction(saved);
    if (body === null) return;
    let rule: { id: string; match_pattern: string };
    try {
      rule = await createRule(body).unwrap();
    } catch (error) {
      const failure = writeFailure(error);
      showError(failure === "gone" ? MSG.couldntSave : PAYEE_RULE_SAVE_FAILURE_MESSAGES[failure]);
      return;
    }
    showSuccess(MSG.saved(body.match_pattern));
    await applyToPast.offer(rule, { quietWhenNone: true });
  }

  return {
    fileLikeThis,
    isBusy: isSavingRule || applyToPast.checkingRuleId !== null,
    applyToPast,
  };
}
