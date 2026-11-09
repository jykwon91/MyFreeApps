import { useCreateMortgageMutation, useUpdateMortgageMutation } from "@mybookkeeper/api-client/store/mortgagesApi";
import type { Mortgage } from "@mybookkeeper/api-client/types/mortgage/mortgage";
import type { MortgageFormValues } from "@mybookkeeper/api-client/types/mortgage/mortgage-form-values";
import { toMortgagePayload } from "@mybookkeeper/api-client/utils/mortgageForm";
import { useToast } from "@platform/mobile";
import { useEffect, useState } from "react";
import { MORTGAGE_FORM_MESSAGES as MESSAGES } from "../../constants/mortgageForm";
import { useFormSubmit } from "../shell/useFormSubmit";
import { mortgageWriteFailure } from "./mortgageWriteFailure";
import { leaveToMortgages } from "./mortgageNavigation";

interface SaveTarget {
  values: MortgageFormValues;
  propertyId: string;
  /** Set when the form was filled from a statement, so the loan cites it. */
  sourceDocumentId: string | null;
}

/** Adds a loan, or saves `original`, and leaves the screen once it landed. */
export function useSaveMortgage(original: Mortgage | null) {
  const { showToast } = useToast();
  const [createMortgage] = useCreateMortgageMutation();
  const [updateMortgage] = useUpdateMortgageMutation();
  const { isBusy, failure, submit, clearFailure } = useFormSubmit();
  const [isLeaving, setIsLeaving] = useState(false);

  // Leaving waits a render, or the discard question still sees the unsaved changes.
  useEffect(() => {
    if (isLeaving) leaveToMortgages();
  }, [isLeaving]);

  async function save({ values, propertyId, sourceDocumentId }: SaveTarget): Promise<void> {
    const landed = await submit(
      () =>
        original
          ? updateMortgage({ mortgageId: original.id, data: toMortgagePayload(values) }).unwrap()
          : createMortgage({
              property_id: propertyId,
              ...toMortgagePayload(values),
              ...(sourceDocumentId ? { source_document_id: sourceDocumentId } : {}),
            }).unwrap(),
      (error) => mortgageWriteFailure(error, original ? "update" : "create"),
    );
    if (!landed) return;
    showToast(original ? MESSAGES.updated : MESSAGES.added);
    setIsLeaving(true);
  }

  return { save, isBusy, isLeaving, failure, clearFailure };
}
