import {
  useConfirmAttributionReviewMutation,
  useRejectAttributionReviewMutation,
} from "@mybookkeeper/api-client/store/attributionApi";
import type { AttributionReviewItem } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import { useToast } from "@platform/mobile";
import { useRef } from "react";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import type { TenantChoice } from "../../types/TenantChoice";
import { askOnce } from "../../lib/askOnce";
import { linkExplanation, linkQuestion, propertyBookedMessage, tenantLinkedMessage } from "./paymentReviewDisplay";
import { reviewFailureMessage, wasAlreadyHandled } from "./paymentReviewFailure";

export function usePaymentReviewActions(item: AttributionReviewItem) {
  const { showToast } = useToast();
  const [confirmReview, { isLoading: isConfirming }] = useConfirmAttributionReviewMutation();
  const [rejectReview, { isLoading: isSkipping }] = useRejectAttributionReviewMutation();
  const isActing = useRef(false);
  const asking = useRef(false);

  async function run(send: () => { unwrap: () => Promise<unknown> }, doneMessage: string): Promise<void> {
    if (isActing.current) return;
    isActing.current = true;
    try {
      await send().unwrap();
      showToast(doneMessage);
    } catch (error) {
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

  return { isConfirming, isSkipping, linkTenant, bookProperty, askToLinkTenant, askToSkip };
}
