import { useAutoReconcileMutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import { compareFailureMessage, compareResultMessage } from "@mybookkeeper/api-client/utils/reconciliationCompare";

export function useCompareWithRecords(
  taxYear: number,
  onToast: (message: string, variant: "success" | "error") => void,
) {
  const [autoReconcile, { isLoading: isComparing }] = useAutoReconcileMutation();

  async function compare(): Promise<void> {
    try {
      const result = await autoReconcile({ tax_year: taxYear }).unwrap();
      const foundIncome = result.auto_matched + result.discrepancies > 0;
      onToast(`${taxYear}: ${compareResultMessage(result)}`, foundIncome ? "success" : "error");
    } catch (error) {
      onToast(compareFailureMessage(error), "error");
    }
  }

  return { compare, isComparing };
}
