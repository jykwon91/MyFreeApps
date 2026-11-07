import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { receiptPreviewPath } from "@mybookkeeper/api-client/utils/receiptPreviewPath";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { API_BASE_URL } from "../../constants/api";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import type { ReceiptSendValues } from "../../types/ReceiptSendValues";
import { shareExportFile } from "../documents/openDocumentFile";
import { useFileRequestHeaders } from "../documents/useFileRequestHeaders";

/**
 * Opens the receipt as it would go out, in the system's viewer. The download skips the API
 * client, so its sign-in may have expired: `renewSession` makes a request that renews it first.
 */
export function useReceiptPreview(renewSession: () => Promise<unknown>): { isPreviewing: boolean; preview: (receipt: PendingReceipt, values: ReceiptSendValues) => Promise<void> } {
  const { showToast } = useToast();
  const headers = useFileRequestHeaders();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const isBusy = useRef(false);

  async function preview(receipt: PendingReceipt, values: ReceiptSendValues): Promise<void> {
    if (isBusy.current) return;
    isBusy.current = true;
    setIsPreviewing(true);
    try {
      await renewSession();
      // Named by the payment's id, never the tenant's name: it's someone's record.
      await shareExportFile(`${API_BASE_URL}${receiptPreviewPath(receipt.transaction_id, values)}`, `receipt-${receipt.transaction_id}.pdf`, headers());
    } catch {
      showToast(MESSAGES.previewFailed, "error");
    } finally {
      isBusy.current = false;
      setIsPreviewing(false);
    }
  }

  return { isPreviewing, preview };
}
