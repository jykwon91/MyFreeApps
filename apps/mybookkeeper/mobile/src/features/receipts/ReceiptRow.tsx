import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { receiptSentFromOtherGmailMessage } from "@mybookkeeper/api-client/utils/receiptSentFromOtherGmailMessage";
import { FIX_ON_WEBSITE, RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
import ReceiptBlockerNote from "./ReceiptBlockerNote";
import { dismissActionLabel, periodLabel, receiptAmount, receivedLine, reviewActionLabel, rowLabel, rowName } from "./receiptDisplay";
import { usePendingReceiptActions } from "./usePendingReceiptActions";

interface ReceiptRowProps {
  receipt: PendingReceipt;
  canWrite: boolean;
  /** False when Gmail can't send, which turns off every row's Send. */
  canSend: boolean;
}

export default function ReceiptRow({ receipt, canWrite, canSend }: ReceiptRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { isDismissing, askToDismiss } = usePendingReceiptActions(receipt);
  const blocker = receipt.send_blocker;
  const otherGmail = receipt.sent_from_other_gmail;
  // The server won't dismiss a receipt while an earlier send is being confirmed, unless it can't be confirmed.
  const isConfirming = receipt.status === "sending" && otherGmail === null;

  return (
    <View style={{ gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <View accessible accessibilityLabel={rowLabel(receipt)} style={{ gap: spacing.xs }}>
        <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "space-between" }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
            {rowName(receipt)}
          </Text>
          <Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{receiptAmount(receipt)}</Text>
        </View>
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{periodLabel(receipt.period_start_date, receipt.period_end_date)}</Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{receivedLine(receipt)}</Text>
      </View>
      {isConfirming ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.checkingWithGmail}</Text> : null}
      {otherGmail ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{`${receiptSentFromOtherGmailMessage(otherGmail)} ${FIX_ON_WEBSITE}`}</Text>
      ) : null}
      {blocker ? <ReceiptBlockerNote blocker={blocker} /> : null}
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          {/* Sending again would email it from the connected account, which may make a second copy. */}
          {otherGmail ? null : (
            <LoadingButton
              accessibilityLabel={reviewActionLabel(receipt)}
              disabled={!canSend || blocker !== null || isDismissing}
              onPress={() => router.push(`/receipts/${receipt.transaction_id}`)}
            >
              {MESSAGES.reviewAndSend}
            </LoadingButton>
          )}
          {isConfirming ? null : (
            <LoadingButton
              accessibilityHint={MESSAGES.dismissHint}
              accessibilityLabel={dismissActionLabel(receipt)}
              isLoading={isDismissing}
              loadingText={MESSAGES.dismissing}
              onPress={askToDismiss}
              variant="ghost"
            >
              {MESSAGES.dismiss}
            </LoadingButton>
          )}
        </View>
      ) : null}
    </View>
  );
}
