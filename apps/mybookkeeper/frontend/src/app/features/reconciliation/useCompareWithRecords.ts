import { useAutoReconcileMutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import { compareFailureMessage, compareOutcome } from "@mybookkeeper/api-client/utils/reconciliationCompare";

export function useCompareWithRecords(
  taxYear: number,
  onToast: (message: string, variant: "success" | "error") => void,
) {
  const [autoReconcile, { isLoading: isComparing }] = useAutoReconcileMutation();

  async function compare(): Promise<void> {
    try {
      const { message, variant } = compareOutcome(taxYear, await autoReconcile({ tax_year: taxYear }).unwrap());
      onToast(message, variant);
    } catch (error) {
      onToast(compareFailureMessage(error), "error");
    }
  }

  return { compare, isComparing };
}
