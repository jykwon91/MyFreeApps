import { showError, showSuccess } from "@platform/ui";
import { PROPERTY_SPLIT_LABELS as L } from "@mybookkeeper/api-client/constants/propertySplitLabels";
import { useRemovePropertySplitMutation, useSetPropertySplitMutation } from "@mybookkeeper/api-client/store/transactionsApi";
import type { TransactionPropertySplit } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplit";
import type { TransactionPropertySplitRequest } from "@mybookkeeper/api-client/types/transaction/TransactionPropertySplitRequest";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";

export interface PropertySplitActions {
  /** Saves the split and toasts; true once saved. */
  save: (request: TransactionPropertySplitRequest) => Promise<boolean>;
  remove: () => Promise<boolean>;
  isSaving: boolean;
  isRemoving: boolean;
}

/** `onSplitsChange` hears the transaction's shares after each save or removal. */
export function usePropertySplitActions(
  transactionId: string,
  onSplitsChange: (splits: TransactionPropertySplit[]) => void,
): PropertySplitActions {
  const [setSplit, { isLoading: isSaving }] = useSetPropertySplitMutation();
  const [removeSplit, { isLoading: isRemoving }] = useRemovePropertySplitMutation();

  async function save(request: TransactionPropertySplitRequest): Promise<boolean> {
    try {
      const result = await setSplit({ id: transactionId, data: request }).unwrap();
      showSuccess(L.saved(result.property_splits.length));
      onSplitsChange(result.property_splits);
      return true;
    } catch (err) {
      showError(rejectedWriteDetail(err, L.saveFailed));
      return false;
    }
  }

  async function remove(): Promise<boolean> {
    try {
      const result = await removeSplit(transactionId).unwrap();
      showSuccess(L.removed);
      onSplitsChange(result.property_splits);
      return true;
    } catch (err) {
      showError(rejectedWriteDetail(err, L.removeFailed));
      return false;
    }
  }

  return { save, remove, isSaving, isRemoving };
}
