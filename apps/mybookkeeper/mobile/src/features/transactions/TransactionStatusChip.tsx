import type { TransactionStatus } from "@mybookkeeper/api-client/types/transaction/TransactionStatus";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { statusLabel } from "./transactionDisplay";

export default function TransactionStatusChip({ status }: { status: TransactionStatus }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  return (
    <View style={{ alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: colors.muted }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.foreground }}>{statusLabel(status)}</Text>
    </View>
  );
}
