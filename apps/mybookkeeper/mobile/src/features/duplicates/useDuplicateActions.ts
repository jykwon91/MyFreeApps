import {
  transactionsApi,
  useDismissDuplicateMutation,
  useKeepDuplicateMutation,
  useMergeDuplicatesMutation,
} from "@mybookkeeper/api-client/store/transactionsApi";
import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import type { MergeFieldSide } from "@mybookkeeper/api-client/types/transaction/MergeFieldSide";
import { isCancelledRequest } from "@mybookkeeper/api-client/utils/isCancelledRequest";
import { computeSurvivingId } from "@mybookkeeper/api-client/utils/mergeDefaults";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import type { AppDispatch } from "../../lib/store";
import type { DuplicateAction } from "../../types/DuplicateAction";
import type { MergeChoices } from "../../types/MergeChoices";
import { duplicateFailureMessage, duplicateRetryMessage } from "./duplicateFailure";

/** Merge, keep one, or dismiss a pair. Each says what happened, and true means it went through. */
export function useDuplicateActions(pair: DuplicatePair) {
  const dispatch = useDispatch<AppDispatch>();
  const { showToast } = useToast();
  const [mergeDuplicates] = useMergeDuplicatesMutation();
  const [keepDuplicate] = useKeepDuplicateMutation();
  const [dismissDuplicate] = useDismissDuplicateMutation();
  const [busy, setBusy] = useState<DuplicateAction | null>(null);
  const inFlight = useRef(false);

  /** The server commits before it answers, so after a lost answer a fresh list tells: the pair is off it once it's resolved. */
  async function settle(action: DuplicateAction, landed: string): Promise<boolean> {
    const latest = await dispatch(transactionsApi.endpoints.getDuplicates.initiate(undefined, { forceRefetch: true, subscribe: false }));
    if (!latest.isSuccess) {
      showToast(MESSAGES.unsure, "error");
      return false;
    }
    if (latest.data.pairs.some((candidate) => candidate.id === pair.id)) {
      showToast(duplicateRetryMessage(action), "error");
      return false;
    }
    showToast(landed);
    return true;
  }

  /** `landed` is what to say when a lost answer turns out to have gone through. */
  async function run(action: DuplicateAction, landed: string, work: () => Promise<string>): Promise<boolean> {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(action);
    try {
      showToast(await work());
      return true;
    } catch (error) {
      // Cancelled by a cache reset (sign-out, workspace switch): nothing was lost, and nobody is left to tell.
      if (isCancelledRequest(error)) return false;
      if (writeOutcome(error) === "unknown") return await settle(action, landed);
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
      run("merge", MESSAGES.merged, async () => {
        const survivingSide = computeSurvivingId(a, b);
        await mergeDuplicates({
          transaction_a_id: a.id,
          transaction_b_id: b.id,
          surviving_id: survivingSide === "a" ? a.id : b.id,
          field_overrides: choices,
        }).unwrap();
        return MESSAGES.merged;
      }),
    keep: (side: MergeFieldSide) => {
      const [kept, removed] = side === "a" ? [a, b] : [b, a];
      const deleteIds = [removed.id];
      return run({ keep: side }, MESSAGES.keptAndRemoved(deleteIds.length), async () => {
        const result = await keepDuplicate({ keep_id: kept.id, delete_ids: deleteIds }).unwrap();
        return MESSAGES.keptAndRemoved(result.deleted);
      });
    },
    dismiss: () =>
      run("dismiss", MESSAGES.dismissed, async () => {
        await dismissDuplicate({ transaction_ids: [a.id, b.id] }).unwrap();
        return MESSAGES.dismissed;
      }),
  };
}
