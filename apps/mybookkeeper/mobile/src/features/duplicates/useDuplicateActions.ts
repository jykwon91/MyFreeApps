import {
  useDismissDuplicateMutation,
  useKeepDuplicateMutation,
  useMergeDuplicatesMutation,
} from "@mybookkeeper/api-client/store/transactionsApi";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { computeSurvivingId } from "@mybookkeeper/api-client/utils/mergeDefaults";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import type { DuplicateAction } from "../../types/DuplicateAction";
import type { MergeChoices } from "../../types/MergeChoices";
import { duplicateFailureMessage } from "./duplicateFailure";

/** Merge, keep one, or dismiss a pair. Each says what happened, and true means it went through. */
export function useDuplicateActions(pair: DuplicatePair) {
  const { showToast } = useToast();
  const [mergeDuplicates] = useMergeDuplicatesMutation();
  const [keepDuplicate] = useKeepDuplicateMutation();
  const [dismissDuplicate] = useDismissDuplicateMutation();
  const [busy, setBusy] = useState<DuplicateAction | null>(null);
  const inFlight = useRef(false);

  async function run(action: DuplicateAction, work: () => Promise<string>): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(action);
    try {
      showToast(await work());
      return true;
    } catch (error) {
      showToast(duplicateFailureMessage(action, error), "error");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const { transaction_a: a, transaction_b: b } = pair;
  return {
    busy,
    merge: (choices: MergeChoices) =>
      run("merge", async () => {
        const survivingSide = computeSurvivingId(a, b);
        await mergeDuplicates({
          transaction_a_id: a.id,
          transaction_b_id: b.id,
          surviving_id: survivingSide === "a" ? a.id : b.id,
          field_overrides: choices,
        }).unwrap();
        return MESSAGES.merged;
      }),
    keep: (side: MergeFieldSide) =>
      run({ keep: side }, async () => {
        const [kept, removed] = side === "a" ? [a, b] : [b, a];
        const result = await keepDuplicate({ keep_id: kept.id, delete_ids: [removed.id] }).unwrap();
        return MESSAGES.keptAndRemoved(result.deleted);
      }),
    dismiss: () =>
      run("dismiss", async () => {
        await dismissDuplicate({ transaction_ids: [a.id, b.id] }).unwrap();
        return MESSAGES.dismissed;
      }),
  };
}
