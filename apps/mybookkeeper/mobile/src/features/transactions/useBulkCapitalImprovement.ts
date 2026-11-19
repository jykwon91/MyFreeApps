import { useBulkSetCapitalImprovementMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import { bulkCapitalImprovementMessage } from "@mybookkeeper/api-client/utils/bulkTransactionMessages";
import { CAPITAL_IMPROVEMENT_COUNT_KEYS } from "../../constants/transactionBulk";
import { bulkCapitalImprovementFailureMessage } from "./transactionMessages";
import { useBulkTransactionRun } from "./useBulkTransactionRun";

/** Marks or unmarks several at once as capital improvements; the server skips anything that isn't an expense. */
function useCapitalImprovementRun(isMarking: boolean) {
  const [bulkSet] = useBulkSetCapitalImprovementMutation();
  return useBulkTransactionRun({
    keys: CAPITAL_IMPROVEMENT_COUNT_KEYS,
    send: (batch) => bulkSet({ ids: batch, is_capital_improvement: isMarking }).unwrap(),
    outcome: (run) => bulkCapitalImprovementMessage(run, isMarking),
    failure: bulkCapitalImprovementFailureMessage(isMarking),
  });
}

/** Each answers with the ids that were not updated because a request failed. */
export function useBulkCapitalImprovement() {
  const mark = useCapitalImprovementRun(true);
  const unmark = useCapitalImprovementRun(false);
  return {
    mark: mark.run,
    unmark: unmark.run,
    isMarking: mark.isRunning,
    isUnmarking: unmark.isRunning,
  };
}
