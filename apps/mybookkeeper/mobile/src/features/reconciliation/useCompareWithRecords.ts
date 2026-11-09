import { useAutoReconcileMutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import { compareFailureMessage, compareOutcome } from "@mybookkeeper/api-client/utils/reconciliationCompare";
import { useToast } from "@platform/mobile";
import { useRef } from "react";

export function useCompareWithRecords(year: number) {
  const { showToast } = useToast();
  const [autoReconcile, { isLoading: isComparing }] = useAutoReconcileMutation();
  const isSending = useRef(false);

  async function compare(): Promise<void> {
    if (isSending.current) return;
    isSending.current = true;
    try {
      const { message, variant } = compareOutcome(year, await autoReconcile({ tax_year: year }).unwrap());
      showToast(message, variant);
    } catch (error) {
      showToast(compareFailureMessage(error), "error");
    } finally {
      isSending.current = false;
    }
  }

  return { compare, isComparing };
}
