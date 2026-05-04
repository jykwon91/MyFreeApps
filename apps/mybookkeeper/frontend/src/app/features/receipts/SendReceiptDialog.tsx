import { useState } from "react";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import { useSendReceiptMutation } from "@/shared/store/rentReceiptsApi";
import type { Transaction } from "@/shared/types/transaction/transaction";

interface Props {
  transaction: Transaction;
  onClose: (receiptNumber?: string) => void;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: "Check",
  credit_card: "Credit card",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  platform_payout: "Platform payout",
  other: "Other",
};

function defaultPeriod(transactionDate: string): { start: string; end: string } {
  const d = new Date(transactionDate + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * Modal dialog to review and send a rent receipt PDF to the tenant.
 * Path A — triggered from a transaction row or the pending receipts page.
 */
export default function SendReceiptDialog({ transaction, onClose }: Props) {
  const period = defaultPeriod(transaction.transaction_date);
  const [periodStart, setPeriodStart] = useState(period.start);
  const [periodEnd, setPeriodEnd] = useState(period.end);
  const [paymentMethod, setPaymentMethod] = useState<string>(
    transaction.payment_method ?? "",
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [sendReceipt, { isLoading: isSending }] = useSendReceiptMutation();

  async function handlePreview() {
    setPreviewLoading(true);
    const params = new URLSearchParams({
      period_start: periodStart,
      period_end: periodEnd,
      ...(paymentMethod ? { payment_method: paymentMethod } : {}),
    });
    const url = `/api/rent-receipts/preview/${transaction.id}?${params.toString()}`;
    setPreviewUrl(url);
    setPreviewLoading(false);
  }

  async function handleSend() {
    try {
      const result = await sendReceipt({
        transaction_id: transaction.id,
        data: {
          period_start: periodStart,
          period_end: periodEnd,
          payment_method: paymentMethod || null,
        },
      }).unwrap();
      showSuccess(`Receipt ${result.receipt_number} sent.`);
      onClose(result.receipt_number);
    } catch (err: unknown) {
      const detail =
        (err as { data?: { detail?: string } })?.data?.detail ?? "";
      if (detail === "gmail_reauth_required") {
        showError(
          "Gmail needs to be reconnected before sending receipts. Go to Integrations → Reconnect Gmail.",
        );
      } else if (detail) {
        showError(detail);
      } else {
        showError("Couldn't send the receipt. Please try again.");
      }
    }
  }

  const amountDisplay = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(parseFloat(transaction.amount));

  return (
    <div
      role="dialog"
      aria-label="Send rent receipt"
      aria-modal="true"
      data-testid="send-receipt-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="bg-card rounded-lg shadow-lg w-full max-w-2xl flex flex-col gap-0 overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold">Send rent receipt</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {amountDisplay} received &mdash; confirm the details before sending.
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
                {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
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
          <div className="flex-1 bg-muted/20 border-t md:border-t-0 md:border-l flex items-center justify-center min-h-64">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                title="Receipt preview"
                data-testid="receipt-preview-iframe"
                className="w-full h-full min-h-64"
                style={{ border: "none" }}
              />
            ) : (
              <p className="text-sm text-muted-foreground p-6 text-center">
                Click "Preview PDF" to see what the tenant will receive.
              </p>
            )}
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
