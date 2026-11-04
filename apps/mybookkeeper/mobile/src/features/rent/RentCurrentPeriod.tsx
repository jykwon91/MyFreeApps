import { RENT_CHARGE_STATUS_LABEL } from "@mybookkeeper/api-client/constants/rentLabels";
import type { RentPeriodSummary } from "@mybookkeeper/api-client/types/rent/rent-period-summary";
import { periodDateRange } from "@mybookkeeper/api-client/utils/rentPeriodDates";
import { proratedNote } from "@mybookkeeper/api-client/utils/rentProratedNote";
import { formatCurrency } from "@platform/core/utils/currency";
import { useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { amountOf, isOverdue, RENT_MESSAGES, stillToCome } from "../../constants/rent";
import InquiryChip from "../inquiries/InquiryChip";
import { isMoreThanACent } from "./rentDisplay";

function periodOutlook(period: RentPeriodSummary): string {
  if (period.status === "waived") return RENT_MESSAGES.periodWaived;
  const remaining = Number(period.remaining);
  if (!isMoreThanACent(remaining) || remaining < 0) return RENT_MESSAGES.fullyCovered;
  return period.status === "overdue" ? isOverdue(formatCurrency(remaining)) : stillToCome(formatCurrency(remaining));
}

export default function RentCurrentPeriod({ period }: { period: RentPeriodSummary }) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const dates = periodDateRange(period);
  const note = proratedNote(period.full_amount);
  const mutedText = { fontSize: fontSize.sm, color: colors.mutedForeground };
  const isLate = period.status === "overdue";

  return (
    <View style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{dates ? `${period.label} · ${dates}` : period.label}</Text>
      <Text style={{ fontSize: fontSize.lg, fontWeight: "600", fontVariant: ["tabular-nums"], color: colors.foreground }}>
        {period.status === "waived" ? formatCurrency(period.amount) : amountOf(formatCurrency(period.allocated), formatCurrency(period.amount))}
      </Text>
      <InquiryChip label={RENT_CHARGE_STATUS_LABEL[period.status]} />
      {note ? <Text style={mutedText}>{note}</Text> : null}
      <Text style={isLate ? { fontSize: fontSize.sm, color: colors.destructive } : mutedText}>{periodOutlook(period)}</Text>
    </View>
  );
}
