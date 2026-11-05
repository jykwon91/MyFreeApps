import { useAutoReconcileMutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { compareResultMessage } from "./reconciliationDisplay";
import { compareFailureMessage } from "./reconciliationFailure";

export function useCompareWithRecords(year: number) {
  const { showToast } = useToast();
  const [autoReconcile, { isLoading: isComparing }] = useAutoReconcileMutation();
  const isSending = useRef(false);

  async function compare(): Promise<void> {
    if (isSending.current) return;
    isSending.current = true;
    try {
      showToast(compareResultMessage(await autoReconcile({ tax_year: year }).unwrap()));
    } catch (error) {
      showToast(compareFailureMessage(error), "error");
    } finally {
      isSending.current = false;
    }
  }

  return { compare, isComparing };
}
