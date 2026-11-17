import type { DuplicatePair } from "@mybookkeeper/api-client/types/transaction/DuplicatePair";
import { duplicateConfidenceLabel, duplicateHeadline } from "@mybookkeeper/api-client/utils/duplicatePairLabels";
import { formatCurrency } from "@platform/core/utils/currency";
import { ClampedText, ListRowTitle, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { DUPLICATES_MESSAGES as MESSAGES } from "../../constants/duplicates";
import { shortDate } from "../transactions/transactionDisplay";
import { duplicatePairName } from "./duplicateDisplay";
import DuplicateChip from "./DuplicateChip";

export default function DuplicateRow({ pair, onPress }: { pair: DuplicatePair; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const name = duplicatePairName(pair);
  const amount = formatCurrency(Number(pair.transaction_a.amount));
  const confidence = duplicateConfidenceLabel(pair.confidence ?? "medium");
  const headline = duplicateHeadline(pair);
  const dates = [...new Set([pair.transaction_a.transaction_date, pair.transaction_b.transaction_date])].sort().map((date) => shortDate(date));
  return (
    <Pressable
      accessibilityHint="Opens the two transactions side by side"
      accessibilityLabel={`${name}, ${amount}, ${headline}, ${confidence}${pair.property_match ? "" : `, ${MESSAGES.differentProperties.toLowerCase()}`}`}
      accessibilityRole="button"
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
      <ListRowTitle
        aside={<Text style={{ fontSize: fontSize.md, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>{amount}</Text>}
        title={name}
      />
      <ClampedText numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {[headline, dates.join(" and ")].join(" · ")}
      </ClampedText>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        <DuplicateChip label={confidence} />
        {pair.property_match ? null : <DuplicateChip label={MESSAGES.differentProperties} />}
      </View>
    </Pressable>
  );
}
