import type { PendingReceipt } from "@mybookkeeper/api-client/types/lease/pending-receipt";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { paidByLine, receiptAmount, receivedLine, rowName } from "./receiptDisplay";

export default function ReceiptSummary({ receipt }: { receipt: PendingReceipt }) {
  const { colors, spacing, fontSize } = useTheme();
  const paidBy = paidByLine(receipt);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text accessibilityRole="header" style={{ fontSize: fontSize.xl, fontWeight: "600", color: colors.foreground }}>
        {rowName(receipt)}
      </Text>
      <Text style={{ fontSize: fontSize.lg, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{receiptAmount(receipt)}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{receivedLine(receipt)}</Text>
      {paidBy ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{paidBy}</Text> : null}
    </View>
  );
}
