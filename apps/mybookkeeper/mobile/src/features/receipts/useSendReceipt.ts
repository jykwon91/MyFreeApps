import { useSendReceiptMutation } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import type { PendingReceiptListResponse } from "@mybookkeeper/api-client/types/lease/pending-receipt-list-response";
import { useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import type { ReceiptSendFailure } from "../../types/ReceiptSendFailure";
import type { ReceiptSendValues } from "../../types/ReceiptSendValues";
import { askOnce } from "../../lib/askOnce";
import { blockerMessage, gmailMessage, sendExplanation, sendQuestion, sentMessage } from "./receiptDisplay";
import { sendFailure } from "./receiptFailure";
import { useDropReceipt } from "./useDropReceipt";

/**
 * Sends one receipt, after asking. The server sends at most once, so a retry is always safe;
 * what changes is how sure I can be about what happened. `reload` returns the list, or null if it can't.
 */
export function useSendReceipt(reload: () => Promise<PendingReceiptListResponse | null>) {
  const { showToast } = useToast();
  const dropReceipt = useDropReceipt();
  const [sendReceipt] = useSendReceiptMutation();
  const [isSending, setIsSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // Kept so the screen still shows it while it goes, after the list has dropped it.
  const [finished, setFinished] = useState<PendingReceipt | null>(null);
  const isActing = useRef(false);
  const asking = useRef(false);

  function finish(receipt: PendingReceipt, message: string): void {
    dropReceipt(receipt.transaction_id);
    showToast(message);
    setFinished(receipt);
  }

  async function explain(receipt: PendingReceipt, outcome: ReceiptSendFailure): Promise<void> {
    if (outcome.kind === "finished") {
      finish(receipt, outcome.message);
      return;
    }
    if (outcome.kind === "message") {
      setFailure(outcome.message);
      return;
    }
    const latest = await reload();
    const row = latest?.items.find((item) => item.transaction_id === receipt.transaction_id);
    if (outcome.kind === "unsure") {
      // Gone from the list means it went out, or someone handled it elsewhere. Still listed, or no list, means I can't tell yet.
      if (latest && !row) finish(receipt, MESSAGES.offList);
      else setFailure(MESSAGES.sendUnsure);
      return;
    }
    const blocker = row?.send_blocker ?? null;
    setFailure((blocker ? blockerMessage(blocker) : null) ?? (latest ? gmailMessage(latest.gmail_state) : null) ?? outcome.fallback);
  }

  async function send(receipt: PendingReceipt, values: ReceiptSendValues): Promise<void> {
    if (isActing.current) return;
    isActing.current = true;
    setIsSending(true);
    setFailure(null);
    try {
      const result = await sendReceipt({
        transaction_id: receipt.transaction_id,
        data: { period_start: values.periodStart, period_end: values.periodEnd, payment_method: values.paymentMethod || null },
      }).unwrap();
      finish(receipt, sentMessage(receipt, result.receipt_number));
    } catch (error) {
      await explain(receipt, sendFailure(error));
    } finally {
      isActing.current = false;
      setIsSending(false);
    }
  }

  /** An email can't be taken back, so this always asks. */
  function askToSend(receipt: PendingReceipt, values: ReceiptSendValues): void {
    if (isActing.current) return;
    askOnce(asking, sendQuestion(receipt), sendExplanation(receipt, values), { text: MESSAGES.sendReceipt, onPress: () => void send(receipt, values) });
  }

  return { isSending, failure, finished, send, askToSend };
}
