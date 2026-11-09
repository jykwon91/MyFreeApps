import { useCreateUtilityPlanMutation, useUpdateUtilityPlanMutation } from "@mybookkeeper/api-client/store/utilityPlansApi";
import type { UtilityPlanDetail } from "@mybookkeeper/api-client/types/utility/utility-plan-detail";
import type { UtilityPlanFormValues } from "@mybookkeeper/api-client/types/utility/utility-plan-form-values";
import { toUtilityPlanFields } from "@mybookkeeper/api-client/utils/utilityPlanForm";
import { useToast } from "@platform/mobile";
import { UTILITY_PLAN_FORM_MESSAGES as MESSAGES } from "../../constants/utilityPlanForm";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

interface SaveTarget {
  values: UtilityPlanFormValues;
  propertyId: string;
  /** Set when the form was filled from a document, so the plan cites it. */
  sourceDocumentId: string | null;
}

/** Adds a plan, or saves `original`, and leaves the screen once it landed. */
export function useSaveUtilityPlan(original: UtilityPlanDetail | null) {
  const { showToast } = useToast();
  const [createPlan] = useCreateUtilityPlanMutation();
  const [updatePlan] = useUpdateUtilityPlanMutation();
  const write = useWrite();
  const { isLeaving, leave } = useLeaveWhenSaved("/utility-plans");
  const copy = saveFailureCopy("utility plan", "utility plans", original === null);

  async function save({ values, propertyId, sourceDocumentId }: SaveTarget): Promise<void> {
    const fields = toUtilityPlanFields(values);
    const result = await write.run(
      () =>
        original
          ? updatePlan({ planId: original.id, data: fields }).unwrap()
          : createPlan({ property_id: propertyId, ...fields, ...(sourceDocumentId ? { source_document_id: sourceDocumentId } : {}) }).unwrap(),
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(original ? MESSAGES.updated : MESSAGES.added);
    leave();
  }

  return { save, isBusy: write.isBusy, isLeaving, failure: write.failure ? copy[write.failure] : null };
}
