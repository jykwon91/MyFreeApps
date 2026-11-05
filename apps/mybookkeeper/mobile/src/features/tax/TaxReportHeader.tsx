import type { TaxSummaryResponse } from "@mybookkeeper/api-client/types/summary/TaxSummaryResponse";
import { Banner, SegmentedControl, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import { Text, View } from "react-native";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { TAX_REPORT_MESSAGES as MESSAGES, TAX_REPORT_VIEWS } from "../../constants/taxReport";
import type { TaxReportView } from "../../types/TaxReportView";
import PickerField from "../transactions/PickerField";
import { spokenMoney, spokenSignedMoney } from "../transactions/transactionDisplay";
import { hasTaxData, toCents, uncategorizedCents } from "./taxReportDisplay";

interface TaxReportHeaderProps {
  year: number;
  summary: TaxSummaryResponse | undefined;
  showLastLoaded: boolean;
  view: TaxReportView;
  onChooseYear: () => void;
  onChangeView: (view: TaxReportView) => void;
}

export default function TaxReportHeader({
  year,
  summary,
  showLastLoaded,
  view,
  onChooseYear,
  onChangeView,
}: TaxReportHeaderProps) {
  const { colors, spacing, radius, fontSize } = useTheme();
  const muted = { fontSize: fontSize.sm, color: colors.mutedForeground } as const;
  const uncategorized = summary ? uncategorizedCents(summary) : 0;
  const net = toCents(summary?.net_taxable_income ?? 0) / 100;
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      <PickerField hint={MESSAGES.yearHint} label={MESSAGES.year} onPress={onChooseYear} value={String(year)} />
      {showLastLoaded ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {uncategorized > 0 ? <Banner message={MESSAGES.uncategorized(formatCurrency(uncategorized / 100))} /> : null}
      {summary && hasTaxData(summary) ? (
        <>
          <View
            accessible
            accessibilityLabel={`${MESSAGES.netIncome}, ${spokenSignedMoney(net)}. ${MESSAGES.revenue} ${spokenMoney(summary.gross_revenue)}. ${MESSAGES.deductions} ${spokenMoney(summary.total_deductions)}. ${MESSAGES.approvedOnly}`}
            style={{ gap: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md }}
          >
            <Text style={muted}>{MESSAGES.netIncome}</Text>
            <Text style={{ fontSize: fontSize.xl, fontWeight: "700", color: colors.foreground }}>{formatCurrency(net)}</Text>
            <Text style={muted}>
              {MESSAGES.revenue} {formatCurrency(summary.gross_revenue)} · {MESSAGES.deductions} {formatCurrency(summary.total_deductions)}
            </Text>
            <Text style={muted}>{MESSAGES.approvedOnly}</Text>
          </View>
          <SegmentedControl accessibilityLabel={MESSAGES.viewLabel} onChange={onChangeView} segments={TAX_REPORT_VIEWS} value={view} />
        </>
      ) : null}
      {summary && summary.w2_total > 0 ? (
        <View accessible accessibilityLabel={`${MESSAGES.wages}, ${spokenMoney(summary.w2_total)}. ${MESSAGES.wagesNote}`} style={{ gap: spacing.xs }}>
          <Text style={{ fontSize: fontSize.md, color: colors.foreground }}>
            {MESSAGES.wages} {formatCurrency(summary.w2_total)}
          </Text>
          <Text style={muted}>{MESSAGES.wagesNote}</Text>
        </View>
      ) : null}
    </View>
  );
}
