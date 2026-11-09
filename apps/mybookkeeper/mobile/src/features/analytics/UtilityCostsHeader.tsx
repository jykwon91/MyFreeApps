import { changeFigures } from "@mybookkeeper/api-client/utils/comparePeriods";
import { Banner, SegmentedControl, useTheme } from "@platform/mobile";
import { formatCurrency } from "@platform/core/utils/currency";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { UTILITY_COSTS_MESSAGES as MESSAGES, UTILITY_GRANULARITIES } from "../../constants/analytics";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import type { UtilityCostRow } from "../../types/UtilityCostRow";
import type { UtilityGranularity } from "../../types/UtilityGranularity";
import ChangeNote from "../analyticsControls/ChangeNote";
import ComparisonNotice from "../analyticsControls/ComparisonNotice";
import HomeLinkRow from "../home/HomeLinkRow";
import { spokenMoney } from "../transactions/transactionDisplay";
import UtilityCostRowView from "./UtilityCostRowView";
import { totalCents } from "./utilityCostsDisplay";

interface UtilityCostsHeaderProps {
  controls: ReactNode;
  granularity: UtilityGranularity;
  propertiesFailed: boolean;
  showLastLoaded: boolean;
  rows: readonly UtilityCostRow[] | null;
  /** Everything the rows add up to, in cents. */
  seenCents: number;
  /** The earlier stretch's rows, or null when not comparing or they haven't loaded. */
  previousRows: readonly UtilityCostRow[] | null;
  againstLabel: string;
  comparisonFailed: boolean;
  isComparisonLoading: boolean;
  range: string;
  onChangeGranularity: (granularity: UtilityGranularity) => void;
  onSeeBills: () => void;
  onRetryComparison: () => Promise<void>;
}

export default function UtilityCostsHeader({
  controls,
  granularity,
  propertiesFailed,
  showLastLoaded,
  rows,
  seenCents,
  previousRows,
  againstLabel,
  comparisonFailed,
  isComparisonLoading,
  range,
  onChangeGranularity,
  onSeeBills,
  onRetryComparison,
}: UtilityCostsHeaderProps) {
  const { colors, spacing, fontSize } = useTheme();
  const dollars = seenCents / 100;
  const previousTotal = previousRows ? totalCents(previousRows) : null;
  const sectionTitle = { fontSize: fontSize.md, fontWeight: "600", color: colors.foreground } as const;
  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }}>
      {showLastLoaded ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {controls}
      <SegmentedControl accessibilityLabel={MESSAGES.granularityLabel} onChange={onChangeGranularity} segments={UTILITY_GRANULARITIES} value={granularity} />
      {propertiesFailed ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.propertiesFailed}</Text> : null}
      <ComparisonNotice failedMessage={MESSAGES.comparisonFailed} hasFailed={comparisonFailed} isLoading={isComparisonLoading} onRetry={onRetryComparison} />
      {rows && rows.length > 0 ? (
        <>
          <View accessible accessibilityLabel={`${MESSAGES.seenInUtilitiesSpoken(spokenMoney(dollars), range)} ${MESSAGES.approvedOnly}`} style={{ gap: spacing.xs }}>
            <Text style={{ fontSize: fontSize.xl, fontWeight: "700", color: colors.foreground }}>{MESSAGES.seenInUtilities(formatCurrency(dollars))}</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{range}</Text>
            <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.approvedOnly}</Text>
          </View>
          {previousTotal === null ? null : <ChangeNote againstLabel={againstLabel} figures={changeFigures(dollars, previousTotal / 100)} higherIsBetter={false} previous={previousTotal / 100} />}
          <HomeLinkRow accessibilityLabel={`${MESSAGES.seeBills}. ${MESSAGES.seeBillsHint}`} label={MESSAGES.seeBills} onPress={onSeeBills} />
          <Text accessibilityRole="header" style={sectionTitle}>
            {MESSAGES.byUtility}
          </Text>
          {rows.map((row) => (
            <UtilityCostRowView
              againstLabel={againstLabel}
              key={row.subCategory}
              previousCents={previousRows ? (previousRows.find((candidate) => candidate.subCategory === row.subCategory)?.cents ?? 0) : null}
              row={row}
              totalCents={seenCents}
            />
          ))}
          <Text accessibilityRole="header" style={sectionTitle}>
            {MESSAGES.byPeriod[granularity]}
          </Text>
        </>
      ) : null}
    </View>
  );
}
