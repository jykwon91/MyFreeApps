import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { LoadingButton, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { RECEIPTS_MESSAGES as MESSAGES } from "../../constants/receipts";
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
  // The server won't dismiss a receipt while an earlier send is being confirmed.
  const isSending = receipt.status === "sending";

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
      {isSending ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.checkingWithGmail}</Text> : null}
      {blocker ? <ReceiptBlockerNote blocker={blocker} /> : null}
      {canWrite ? (
        <View style={{ gap: spacing.sm }}>
          <LoadingButton
            accessibilityLabel={reviewActionLabel(receipt)}
            disabled={!canSend || blocker !== null || isDismissing}
            onPress={() => router.push(`/receipts/${receipt.transaction_id}`)}
          >
            {MESSAGES.reviewAndSend}
          </LoadingButton>
          {isSending ? null : (
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
