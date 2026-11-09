import { REFERENCE_ONLY_COPY } from "@mybookkeeper/api-client/constants/documentReferenceOnly";
import { useToggleEscrowPaidMutation } from "@mybookkeeper/api-client/store/documentsApi";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import { referenceOnlyMarkedMessage } from "@mybookkeeper/api-client/utils/escrowToggleMessage";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { askOnce } from "../../lib/askOnce";
import { referenceOnlyFailureMessage } from "./referenceOnlyFailureMessage";

/** Marking a document reference-only removes its transactions, so that asks first; unmarking doesn't. */
export function useReferenceOnly(document: Document) {
  const { showToast } = useToast();
  const [toggleEscrow, { isLoading }] = useToggleEscrowPaidMutation();
  const asking = useRef(false);

  async function set(isReferenceOnly: boolean): Promise<void> {
    try {
      const result = await toggleEscrow({ id: document.id, is_escrow_paid: isReferenceOnly }).unwrap();
      showToast(isReferenceOnly ? referenceOnlyMarkedMessage(result.transactions_removed) : REFERENCE_ONLY_COPY.unmarked, "success");
    } catch (error) {
      showToast(referenceOnlyFailureMessage(error), "error");
    }
  }

  function toggle(): void {
    if (isLoading) return;
    if (document.is_escrow_paid) {
      void set(false);
      return;
    }
    askOnce(asking, REFERENCE_ONLY_COPY.confirmTitle, REFERENCE_ONLY_COPY.confirmBody, { text: REFERENCE_ONLY_COPY.confirmAction, onPress: () => void set(true) });
  }

  return { toggle, isToggling: isLoading, isReferenceOnly: document.is_escrow_paid };
}
