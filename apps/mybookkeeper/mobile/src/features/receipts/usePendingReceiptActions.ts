import { useDismissReceiptMutation } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import { askOnce } from "../../lib/askOnce";
import { dismissFailure } from "./receiptFailure";
import { useDropReceipt } from "./useDropReceipt";

export function usePendingReceiptActions(receipt: PendingReceipt) {
  const { showToast } = useToast();
  const dropReceipt = useDropReceipt();
  const [dismissReceipt, { isLoading: isDismissing }] = useDismissReceiptMutation();
  const isActing = useRef(false);
  const asking = useRef(false);

  async function dismiss(): Promise<void> {
    if (isActing.current) return;
    isActing.current = true;
    try {
      await dismissReceipt({ transaction_id: receipt.transaction_id }).unwrap();
      dropReceipt(receipt.transaction_id);
      showToast(MESSAGES.dismissed);
    } catch (error) {
      const failure = dismissFailure(error);
      if (failure.isFinished) dropReceipt(receipt.transaction_id);
      showToast(failure.message, failure.isFinished ? "success" : "error");
    } finally {
      isActing.current = false;
    }
  }

  function askToDismiss(): void {
    // Gmail can't settle a send that went through another account, so dismissing may hide one that never arrived.
    const body = receipt.sent_from_other_gmail === null ? MESSAGES.dismissBody : MESSAGES.dismissOtherGmailBody;
    askOnce(asking, MESSAGES.dismissTitle, body, {
      text: MESSAGES.dismiss,
      style: "destructive",
      onPress: () => void dismiss(),
    });
  }

  return { isDismissing, dismiss, askToDismiss };
}
