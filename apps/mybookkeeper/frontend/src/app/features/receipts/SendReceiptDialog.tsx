import { useEffect, useState } from "react";
import { Button, LoadingButton, showError, showSuccess } from "@platform/ui";
import { formatCurrency } from "@/shared/utils/currency";
import api from "@/shared/lib/api";
import { useSendReceiptMutation } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { RECEIPT_PAYMENT_METHOD_LABELS } from "@mybookkeeper/api-client/constants/receiptPaymentMethods";
import { inferPaymentMethod } from "@mybookkeeper/api-client/utils/inferPaymentMethod";
import { receiptPreviewPath } from "@mybookkeeper/api-client/utils/receiptPreviewPath";
import { receiptPayerName } from "@mybookkeeper/api-client/utils/receiptPayerName";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { receiptSendClosesDialog, receiptSendErrorMessage } from "@/shared/lib/receipt-send-errors";
import ReceiptPreviewPane from "./ReceiptPreviewPane";

export interface SendReceiptDialogProps {
  receipt: PendingReceipt;
  onClose: (receiptNumber?: string) => void;
}

/**
 * Modal dialog to review and send a rent receipt PDF to the tenant.
 *
 * The period starts as the one stored on the queued receipt, which the lease
 * set when the payment was linked to the tenant.
 */
export default function SendReceiptDialog({ receipt, onClose }: SendReceiptDialogProps) {
  const [periodStart, setPeriodStart] = useState(receipt.period_start_date);
  const [periodEnd, setPeriodEnd] = useState(receipt.period_end_date);
  const [paymentMethod, setPaymentMethod] = useState<string>(() =>
    inferPaymentMethod(receipt),
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [sendReceipt, { isLoading: isSending }] = useSendReceiptMutation();

  // Free the blob URL when it changes or the dialog unmounts. Iframes don't
  // release blob: URLs on src change, so leaks accumulate without this.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      // Iframes don't carry the JWT Authorization header — fetch the PDF as
      // a blob via the authenticated axios client, then point the iframe at
      // a blob: URL we control.
      const res = await api.get(
        receiptPreviewPath(receipt.transaction_id, { periodStart, periodEnd, paymentMethod }),
        { responseType: "blob" },
      );
      const blobUrl = URL.createObjectURL(res.data as Blob);
      setPreviewUrl(blobUrl);
    } catch {
      setPreviewError("Couldn't load preview. Try again.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSend() {
    try {
      const result = await sendReceipt({
        transaction_id: receipt.transaction_id,
        data: {
          period_start: periodStart,
          period_end: periodEnd,
          payment_method: paymentMethod || null,
        },
      }).unwrap();
      showSuccess(`Receipt ${result.receipt_number} sent.`);
      onClose(result.receipt_number);
    } catch (err: unknown) {
      showError(receiptSendErrorMessage(err));
      if (receiptSendClosesDialog(err)) onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Send rent receipt"
      aria-modal="true"
      data-testid="send-receipt-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-card rounded-lg shadow-lg w-full max-w-5xl flex flex-col gap-0 overflow-hidden h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold">Send rent receipt</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatCurrency(receipt.amount)} from {receiptPayerName(receipt) ?? "this tenant"} &mdash;
            confirm the details before sending.
          </p>
        </div>

        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Left: form */}
          <div className="p-6 space-y-4 md:w-72 shrink-0 overflow-y-auto">
            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="period-start">
                Period start
              </label>
              <input
                id="period-start"
                type="date"
                data-testid="receipt-period-start"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  setPreviewUrl(null);
                }}
                className="w-full px-3 py-2 text-sm border rounded-md"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="period-end">
                Period end
              </label>
              <input
                id="period-end"
                type="date"
                data-testid="receipt-period-end"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  setPreviewUrl(null);
                }}
                className="w-full px-3 py-2 text-sm border rounded-md"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium" htmlFor="payment-method">
                Payment method
              </label>
              <select
                id="payment-method"
                data-testid="receipt-payment-method"
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setPreviewUrl(null);
                }}
                className="w-full px-3 py-2 text-sm border rounded-md"
              >
                <option value="">— select —</option>
                {Object.entries(RECEIPT_PAYMENT_METHOD_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              data-testid="receipt-preview-btn"
              onClick={() => void handlePreview()}
              disabled={previewLoading}
            >
              {previewLoading ? "Loading…" : "Preview PDF"}
            </Button>
          </div>

          {/* Right: PDF preview */}
          <div className="flex-1 bg-muted/20 border-t md:border-t-0 md:border-l flex items-center justify-center min-h-0">
            <ReceiptPreviewPane url={previewUrl} error={previewError} />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="receipt-cancel-btn"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            variant="primary"
            size="sm"
            data-testid="receipt-send-btn"
            isLoading={isSending}
            loadingText="Sending…"
            onClick={() => void handleSend()}
          >
            Send receipt
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
