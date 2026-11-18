import { RECONCILIATION_DELETE_MESSAGES as DELETE } from "@mybookkeeper/api-client/constants/reconciliationDelete";
import { useDeleteReconciliationSourceMutation } from "@mybookkeeper/api-client/store/reconciliationApi";
import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { askOnce } from "../../lib/askOnce";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";

/** `onDeleted` lets a screen about this one form leave once it is gone. */
export function useDeleteReconciliationSource(source: ReconciliationSource, onDeleted?: () => void) {
  const { showToast } = useToast();
  const [deleteSource, { isLoading: isDeleting }] = useDeleteReconciliationSourceMutation();
  const asking = useRef(false);

  async function remove(): Promise<void> {
    try {
      await deleteSource(source.id).unwrap();
      showToast(DELETE.deleted);
      onDeleted?.();
    } catch (error) {
      if (isCancelledRequest(error)) return;
      showToast(DELETE.failed, "error");
    }
  }

  function askToDelete(): void {
    if (isDeleting) return;
    askOnce(asking, DELETE.confirmTitle, DELETE.confirmBody, {
      text: DELETE.action,
      style: "destructive",
      onPress: () => void remove(),
    });
  }

  return { isDeleting, askToDelete };
}
