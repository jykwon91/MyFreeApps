import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import { Chip, ListRowTitle, MIN_TOUCH_TARGET, useLargeText, useTheme } from "@platform/mobile";
import { memo } from "react";
import { Pressable, Text } from "react-native";
import { categoryLabel, displayAmount, isMoneyIn, rowAccessibilityLabel, shortDate, statusLabel, transactionName } from "./transactionDisplay";

function TransactionRow({
  transaction,
  propertyName,
  onPress,
  onLongPress,
  isSelected,
}: {
  transaction: Transaction;
  propertyName: string | null;
  /** Handed the transaction so one handler serves every row and the row can stay memoized. */
  onPress: (transaction: Transaction) => void;
  /** Starts picking several, from this one. Not offered to someone who can't change anything. */
  onLongPress?: (transaction: Transaction) => void;
  /** Set while picking several: the row then ticks on and off instead of opening. */
  isSelected?: boolean;
}) {
  const isPicking = isSelected !== undefined;
  const { colors, spacing, fontSize } = useTheme();
  const isLargeText = useLargeText();
  const details = [shortDate(transaction.transaction_date), categoryLabel(transaction.category), propertyName]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      accessibilityLabel={rowAccessibilityLabel(transaction, propertyName)}
      accessibilityHint={onLongPress && !isPicking ? "Press and hold to select several" : undefined}
      accessibilityRole={isPicking ? "checkbox" : "button"}
      accessibilityState={isPicking ? { checked: isSelected } : undefined}
      onLongPress={isPicking || !onLongPress ? undefined : () => onLongPress(transaction)}
      onPress={() => onPress(transaction)}
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
      <ListRowTitle
        aside={
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
        }
        leading={
          isPicking ? (
            <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: fontSize.md, color: isSelected ? colors.primary : colors.mutedForeground }}>
              {isSelected ? "☑" : "☐"}
            </Text>
          ) : null
        }
        title={transactionName(transaction)}
      />
      <Text numberOfLines={isLargeText ? undefined : 1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {details}
      </Text>
      {transaction.status === "approved" ? null : <Chip label={statusLabel(transaction.status)} />}
    </Pressable>
  );
}

export default memo(TransactionRow);
