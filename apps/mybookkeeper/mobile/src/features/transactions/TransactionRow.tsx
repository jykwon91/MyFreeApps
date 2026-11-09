import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { categoryLabel, displayAmount, isMoneyIn, rowAccessibilityLabel, shortDate, transactionName } from "./transactionDisplay";
import TransactionStatusChip from "./TransactionStatusChip";

export default function TransactionRow({
  transaction,
  propertyName,
  onPress,
  onLongPress,
  isSelected,
}: {
  transaction: Transaction;
  propertyName: string | null;
  onPress: () => void;
  /** Starts picking several, from this one. Not offered to someone who can't change anything. */
  onLongPress?: () => void;
  /** Set while picking several: the row then ticks on and off instead of opening. */
  isSelected?: boolean;
}) {
  const isPicking = isSelected !== undefined;
  const { colors, spacing, fontSize } = useTheme();
  const details = [shortDate(transaction.transaction_date), categoryLabel(transaction.category), propertyName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityLabel={rowAccessibilityLabel(transaction, propertyName)}
      accessibilityHint={onLongPress && !isPicking ? "Press and hold to select several" : undefined}
      accessibilityRole={isPicking ? "checkbox" : "button"}
      accessibilityState={isPicking ? { checked: isSelected } : undefined}
      onLongPress={isPicking ? undefined : onLongPress}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <View style={{ flexDirection: "row", gap: spacing.sm }}>
        {isPicking ? (
          <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.md, color: isSelected ? colors.primary : colors.mutedForeground }}>
            {isSelected ? "☑" : "☐"}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
          {transactionName(transaction)}
        </Text>
        <Text
          style={{
            fontSize: fontSize.md,
            fontWeight: "600",
            fontVariant: ["tabular-nums"],
            color: isMoneyIn(transaction) ? colors.positiveText : colors.foreground,
          }}
        >
          {displayAmount(transaction)}
        </Text>
      </View>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {details}
      </Text>
      {transaction.status === "approved" ? null : <TransactionStatusChip status={transaction.status} />}
    </Pressable>
  );
}
