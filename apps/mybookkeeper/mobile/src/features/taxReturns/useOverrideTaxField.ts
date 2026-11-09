import { useOverrideFieldMutation } from "@mybookkeeper/api-client/store/taxReturnsApi";
import { getApiValidationDetail } from "@mybookkeeper/api-client/utils/apiValidationDetail";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { useToast } from "@platform/mobile";
import { useState } from "react";
import { TAX_FIELD_OVERRIDE_MESSAGES as MESSAGES } from "../../constants/taxFieldOverride";
import type { OverrideTarget } from "../../types/OverrideTarget";
import { useLeaveWhenSaved } from "../../lib/useLeaveWhenSaved";
import { useWrite } from "../../lib/useWrite";
import { saveFailureCopy } from "../../lib/writeFailureCopy";

/** Overrides one field of a return and leaves the screen once it landed. */
export function useOverrideTaxField(returnId: string) {
  const { showToast } = useToast();
  const [overrideField] = useOverrideFieldMutation();
  const write = useWrite();
  // A 422 here is the server explaining what is wrong with the value typed (a hidden value, too many digits), which the person can fix.
  const [rejection, setRejection] = useState<string | null>(null);
  const { isLeaving, leave } = useLeaveWhenSaved(`/tax-returns/${returnId}`);
  const failureCopy = { ...saveFailureCopy("value", "values", false), conflict: MESSAGES.saveFailed };

  async function save({ fieldId, reason, ...override }: OverrideTarget): Promise<void> {
    setRejection(null);
    const result = await write.run(
      async () => {
        try {
          await overrideField({ return_id: returnId, field_id: fieldId, override_reason: reason.trim(), ...override }).unwrap();
        } catch (error) {
          if (httpStatus(error) === 422) setRejection(getApiValidationDetail(error, failureCopy.invalid));
          throw error;
        }
      },
      { staysLocked: true },
    );
    if (result !== "done") return;
    showToast(MESSAGES.saved, "success");
    leave();
  }

  return { save, isBusy: write.isBusy, isLeaving, failure: write.failure ? (write.failure === "invalid" && rejection) || failureCopy[write.failure] : null };
}
