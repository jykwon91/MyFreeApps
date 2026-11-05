import { attributionPayoutLabel } from "@mybookkeeper/api-client/constants/attributionLabels";
import type { AttributionReviewItem } from "@mybookkeeper/api-client/types/attribution/attribution-review-item";
import { formatCurrency } from "@platform/core/utils/currency";
import { LoadingButton, useTheme } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { PAYMENT_REVIEW_MESSAGES as MESSAGES } from "../../constants/paymentReview";
import { shortDate } from "../transactions/transactionDisplay";
import {
  confirmActionLabel,
  confirmLabel,
  isPayout,
  payerName,
  pickActionLabel,
  pickLabel,
  proposedTarget,
  rowLabel,
  skipActionLabel,
  suggestionLine,
} from "./paymentReviewDisplay";
import PaymentReviewPropertySheet from "./PaymentReviewPropertySheet";
import PaymentReviewTenantSheet from "./PaymentReviewTenantSheet";
import { usePaymentReviewActions } from "./usePaymentReviewActions";

interface PaymentReviewRowProps {
  item: AttributionReviewItem;
  canWrite: boolean;
}

export default function PaymentReviewRow({ item, canWrite }: PaymentReviewRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { isConfirming, isSkipping, linkTenant, bookProperty, askToLinkTenant, askToSkip } = usePaymentReviewActions(item);
  // A sheet loads its list when it first mounts, so a row nobody opens loads nothing.
  const [hasOpenedSheet, setHasOpenedSheet] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const picked = useRef<{ id: string; name: string } | null>(null);
  const transaction = item.transaction;
  const payout = isPayout(item);
  const target = proposedTarget(item);
  const isBusy = isConfirming || isSkipping;
  const amount = transaction ? formatCurrency(Number(transaction.amount)) : null;
  const dateLine = transaction
    ? [shortDate(transaction.transaction_date), payout && transaction.channel ? attributionPayoutLabel(transaction.channel) : null].filter(Boolean).join(" · ")
    : null;
  const sheetDescription = `${[amount, `from ${payerName(item)}`, transaction ? `on ${shortDate(transaction.transaction_date)}` : null].filter(Boolean).join(" ")}.`;

  function openSheet(): void {
    setHasOpenedSheet(true);
    setIsPicking(true);
  }

  function pick(choice: { id: string; name: string }): void {
    picked.current = choice;
    setIsPicking(false);
  }

  // An Alert raised while the sheet is still closing can be lost on iOS.
  function actOnPick(): void {
    const choice = picked.current;
    picked.current = null;
    if (!choice) return;
    if (payout) void bookProperty(choice);
    else askToLinkTenant(choice);
  }

  function confirmProposed(proposed: { id: string; name: string }): void {
    if (payout) void bookProperty(proposed);
    else void linkTenant(proposed);
  }

  const Sheet = payout ? PaymentReviewPropertySheet : PaymentReviewTenantSheet;

  return (
    <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View accessible accessibilityLabel={rowLabel(item)} style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {payerName(item)}
          </Text>
          {amount ? <Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.positiveText }}>{amount}</Text> : null}
        </View>
        {dateLine ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{dateLine}</Text> : null}
        {transaction?.description ? (
          <Text numberOfLines={2} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
            {transaction.description}
          </Text>
        ) : null}
        <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>{suggestionLine(item)}</Text>
      </View>
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          {target ? (
            <>
              <LoadingButton
                accessibilityLabel={confirmActionLabel(item, target)}
                disabled={isBusy}
                isLoading={isConfirming}
                loadingText={MESSAGES.saving}
                onPress={() => confirmProposed(target)}
              >
                {confirmLabel(item, target)}
              </LoadingButton>
              <LoadingButton accessibilityLabel={pickActionLabel(item)} disabled={isBusy} onPress={openSheet} variant="secondary">
                {pickLabel(item)}
              </LoadingButton>
            </>
          ) : (
            <LoadingButton
              accessibilityLabel={pickActionLabel(item)}
              disabled={isBusy}
              isLoading={isConfirming}
              loadingText={MESSAGES.saving}
              onPress={openSheet}
            >
              {pickLabel(item)}
            </LoadingButton>
          )}
          <LoadingButton
            accessibilityHint={MESSAGES.skipHint}
            accessibilityLabel={skipActionLabel(item)}
            disabled={isBusy}
            isLoading={isSkipping}
            loadingText={MESSAGES.skipping}
            onPress={askToSkip}
            variant="ghost"
          >
            {MESSAGES.skip}
          </LoadingButton>
        </View>
      ) : null}
      {hasOpenedSheet ? (
        <Sheet description={sheetDescription} isOpen={isPicking} onClose={() => setIsPicking(false)} onClosed={actOnPick} onPick={pick} />
      ) : null}
    </View>
  );
}
