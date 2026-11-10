import { useDeleteClassificationRuleMutation } from "@mybookkeeper/api-client/store/classificationRulesApi";
import { useToast } from "@platform/mobile";
import { VENDOR_RULE_MESSAGES } from "../../constants/vendorRules";
import { useWrite } from "../../lib/useWrite";
import { deleteFailureCopy } from "../../lib/writeFailureCopy";

const DELETE_COPY = deleteFailureCopy("rule");

/** The one change a rule allows (the server has no edit): delete it. */
export function useVendorRuleActions(ruleId: string, onDeleted: () => void) {
  const { showToast } = useToast();
  const [deleteRule] = useDeleteClassificationRuleMutation();
  const removal = useWrite();

  async function remove(): Promise<void> {
    const result = await removal.run(() => deleteRule(ruleId).unwrap(), { staysLocked: true });
    if (result !== "done" && result !== "gone") return;
    onDeleted();
    showToast(result === "done" ? VENDOR_RULE_MESSAGES.deleted : VENDOR_RULE_MESSAGES.alreadyDeleted);
  }

  const failure = removal.failure && removal.failure !== "gone" ? DELETE_COPY[removal.failure] : null;
  return { remove, isDeleting: removal.isBusy, failure };
}
