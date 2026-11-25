import {
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
} from "@mybookkeeper/api-client/store/attributionApi";
import type { AttributionReviewItem } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import {
  useMarkPersonalTransferMutation,
  useUnmarkPersonalTransferMutation,
} from "@mybookkeeper/api-client/store/personalTransferApi";
import {
  personalTransferMarkedMessage,
  personalTransferUnmarkedMessage,
} from "@mybookkeeper/api-client/utils/personalTransferMessages";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import type { TenantChoice } from "../../types/TenantChoice";
import { askOnce } from "../../lib/askOnce";
import { linkExplanation, linkQuestion, propertyBookedMessage, tenantLinkedMessage } from "./paymentReviewDisplay";
import { reviewFailureMessage, wasAlreadyHandled } from "./paymentReviewFailure";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";

export function usePaymentReviewActions(item: AttributionReviewItem) {
  const { showToast } = useToast();
  const [confirmReview, { isLoading: isConfirming }] = useConfirmAttributionReviewMutation();
  const [rejectReview, { isLoading: isSkipping }] = useRejectAttributionReviewMutation();
  const [markPersonal, { isLoading: isMarkingPersonal }] = useMarkPersonalTransferMutation();
  const [unmarkPersonal] = useUnmarkPersonalTransferMutation();
  const isActing = useRef(false);
  const asking = useRef(false);

  /** `done` is the toast to show, or what to do with the result. */
  async function run<T>(send: () => { unwrap: () => Promise<T> }, done: string | ((result: T) => void)): Promise<void> {
    if (isActing.current) return;
    isActing.current = true;
    try {
      const result = await send().unwrap();
      if (typeof done === "string") showToast(done);
      else done(result);
    } catch (error) {
      if (isCancelledRequest(error)) return;
      showToast(reviewFailureMessage(error), wasAlreadyHandled(error) ? "success" : "error");
    } finally {
      isActing.current = false;
    }
  }

  function linkTenant(tenant: TenantChoice): Promise<void> {
    return run(() => confirmReview({ review_id: item.id, applicant_id: tenant.id }), tenantLinkedMessage(item, tenant.name));
  }

  function bookProperty(property: TenantChoice): Promise<void> {
    return run(() => confirmReview({ review_id: item.id, property_id: property.id }), propertyBookedMessage(property.name));
  }

  /** A long list is easy to mis-tap, and a wrong link keeps matching that payer's later payments. */
  function askToLinkTenant(tenant: TenantChoice): void {
    askOnce(asking, linkQuestion(tenant.name), linkExplanation(item), { text: MESSAGES.link, onPress: () => void linkTenant(tenant) });
  }

  function askToSkip(): void {
    askOnce(asking, MESSAGES.skipTitle, MESSAGES.skipBody, {
      text: MESSAGES.skip,
      style: "destructive",
      onPress: () => void run(() => rejectReview({ review_id: item.id }), MESSAGES.skipped),
    });
  }

  // Undo takes back the whole tap, the remembered sender included.
  async function undoPersonal(transactionId: string): Promise<void> {
    try {
      const result = await unmarkPersonal({ transaction_id: transactionId, forget_sender: true }).unwrap();
      showToast(personalTransferUnmarkedMessage(result));
    } catch (error) {
      if (isCancelledRequest(error)) return;
      showToast(reviewFailureMessage(error), "error");
    }
  }

  function markPersonalTransfer(): Promise<void> {
    const transactionId = item.transaction_id;
    return run(
      () => markPersonal(transactionId),
      (result) =>
        showToast(personalTransferMarkedMessage(result), "success", {
          label: MESSAGES.undo,
          accessibilityHint: MESSAGES.undoHint,
          onPress: () => void undoPersonal(transactionId),
        }),
    );
  }

  return { isConfirming, isSkipping, isMarkingPersonal, linkTenant, bookProperty, askToLinkTenant, askToSkip, markPersonalTransfer };
}
