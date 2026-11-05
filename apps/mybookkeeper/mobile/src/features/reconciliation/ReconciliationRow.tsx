import type { ReconciliationSource } from "@mybookkeeper/api-client/types/reconciliation/reconciliation-source";
import { hasBeenCompared } from "@mybookkeeper/api-client/utils/reconciliationCompare";
import { formatCurrency } from "@platform/core/utils/currency";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { RECONCILIATION_MESSAGES as MESSAGES } from "../../constants/reconciliation";
import InquiryChip from "../inquiries/InquiryChip";
import { differenceLine, rowLabel, sourceTitle, statusWord } from "./reconciliationDisplay";

export default function ReconciliationRow({ source }: { source: ReconciliationSource }) {
  const { colors, spacing, fontSize } = useTheme();
  const difference = differenceLine(source);
  return (
    <View
      accessible
      accessibilityLabel={rowLabel(source)}
      style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {sourceTitle(source)}
      </Text>
      {source.property_name ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{source.property_name}</Text> : null}
      <Text style={{ fontSize: fontSize.lg, fontWeight: "600", color: colors.foreground }}>{formatCurrency(Number(source.reported_amount))}</Text>
      {hasBeenCompared(source) ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {MESSAGES.inMyRecords} {formatCurrency(Number(source.matched_amount))}
        </Text>
      ) : null}
      {difference ? <Text style={{ fontSize: fontSize.sm, color: colors.foreground }}>{difference}</Text> : null}
      <InquiryChip label={statusWord(source.status)} />
    </View>
  );
}
