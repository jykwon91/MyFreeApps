import { useGetUtilityTrendsQuery } from "@mybookkeeper/api-client/store/analyticsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetSummaryYearsQuery } from "@mybookkeeper/api-client/store/summaryApi";
import type { CompareMode } from "@mybookkeeper/api-client/types/analytics/compare-mode";
import { EmptyState, useRefresh } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList } from "react-native";
import { UTILITY_COSTS_MESSAGES as MESSAGES } from "../../constants/analytics";
import { COMPARE_AGAINST_LABEL } from "../../constants/moneyAnalysis";
import { useToday } from "../../lib/useToday";
import type { AnalysisSelection } from "../../types/AnalysisSelection";
import type { UtilityGranularity } from "../../types/UtilityGranularity";
import AnalysisControls from "../analyticsControls/AnalysisControls";
import { analysisChoices, currentSelection, selectionComparison, selectionDates, selectionFor, summaryDates } from "../analyticsControls/analysisPeriod";
import { drillDownLink } from "../drillDown/drillDownLink";
import { useCanWrite } from "../workspace/useCanWrite";
import UtilityCostMonthRow from "./UtilityCostMonthRow";
import { totalCents, utilityRows } from "./utilityCostsDisplay";
import UtilityCostsHeader from "./UtilityCostsHeader";
import UtilityCostsSkeleton from "./UtilityCostsSkeleton";
import { isCurrentPeriod, periodBounds, periodRows, spanOf } from "./utilityPeriods";

const DEFAULT_PERIOD = "last_12_months";
const UTILITIES_CATEGORY = "utilities";

export default function UtilityCostsScreen() {
  const canWrite = useCanWrite();
  const today = useToday();
  const [chosen, setSelection] = useState<AnalysisSelection>(() => selectionFor(DEFAULT_PERIOD, today));
  const selection = useMemo(() => currentSelection(chosen, today), [chosen, today]);
  const [compare, setCompare] = useState<CompareMode>("none");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<UtilityGranularity>("monthly");
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const years = useGetSummaryYearsQuery();
  const choices = useMemo(() => analysisChoices(today, years.data), [today, years.data]);
  const scoped = propertyIds.length > 0 ? propertyIds : undefined;
  const comparison = selectionComparison(selection, compare);

  const { currentData, error, isFetching, refetch } = useGetUtilityTrendsQuery({ ...summaryDates(selection.range), propertyIds: scoped, granularity });
  const previous = useGetUtilityTrendsQuery({ ...summaryDates(comparison), propertyIds: scoped, granularity }, { skip: comparison === null });
  const { data: properties = [], error: propertiesError, refetch: refetchProperties } = useGetPropertiesQuery();
  const { refresh, refreshControl } = useRefresh(async () => {
    await Promise.all([refetch(), comparison ? previous.refetch() : undefined, propertiesError ? refetchProperties() : undefined]);
  }, error);

  const trends = currentData?.trends;
  const rows = useMemo(() => (trends ? utilityRows(trends) : null), [trends]);
  const previousRows = useMemo(() => (comparison && previous.currentData ? utilityRows(previous.currentData.trends) : null), [comparison, previous.currentData]);
  const span = useMemo(() => (trends ? spanOf(selection.range ? { startDate: selection.range.since, endDate: selection.range.until } : null, trends, today) : null), [trends, selection.range, today]);
  const periods = useMemo(() => (trends && trends.length > 0 && span ? periodRows(trends, span, granularity) : []), [trends, span, granularity]);
  const largestPeriodCents = Math.max(0, ...periods.map((period) => period.cents));
  const isDefaultView = selection.key === DEFAULT_PERIOD && propertyIds.length === 0;
  const comparisonFailed = comparison !== null && !previous.currentData && !previous.isFetching && previous.isError;
  const againstLabel = compare === "none" ? "" : COMPARE_AGAINST_LABEL[compare];
  const billsScope = { ...summaryDates(selection.range), propertyIds: scoped };

  function emptyList() {
    if (currentData && !isDefaultView) {
      return (
        <EmptyState
          action={{
            label: MESSAGES.showDefault,
            onPress: () => {
              setSelection(selectionFor(DEFAULT_PERIOD, today));
              setPropertyIds([]);
            },
          }}
          body={MESSAGES.noneInRangeBody}
          heading={MESSAGES.noneInRangeHeading}
        />
      );
    }
    if (currentData) {
      return (
        <EmptyState
          action={canWrite ? { label: MESSAGES.takePhoto, onPress: () => router.push("/camera") } : undefined}
          body={canWrite ? MESSAGES.noneBodyWriter : MESSAGES.noneBodyViewer}
          heading={MESSAGES.noneHeading}
        />
      );
    }
    if (isFetching) return <UtilityCostsSkeleton />;
    return <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />;
  }

  return (
    <FlatList
      ListEmptyComponent={emptyList()}
      ListHeaderComponent={
        <UtilityCostsHeader
          againstLabel={againstLabel}
          comparisonFailed={comparisonFailed}
          controls={
            <AnalysisControls
              choices={choices}
              compare={compare}
              onCompare={setCompare}
              onPropertyIds={(ids) => {
                setPropertyIds(ids);
                setExpandedPeriod(null);
              }}
              onSelection={(next) => {
                setSelection(next);
                setExpandedPeriod(null);
              }}
              propertyIds={propertyIds}
              properties={properties}
              selection={selection}
              today={today}
            />
          }
          granularity={granularity}
          onChangeGranularity={(next) => {
            setGranularity(next);
            setExpandedPeriod(null);
          }}
          onRetryComparison={async () => {
            await previous.refetch();
          }}
          onSeeBills={() => router.navigate(drillDownLink({ ...billsScope, category: UTILITIES_CATEGORY, label: MESSAGES.billsTitle }))}
          previousRows={previousRows}
          propertiesFailed={Boolean(propertiesError) && properties.length === 0}
          range={selectionDates(selection)}
          rows={rows}
          showLastLoaded={Boolean(error) && currentData !== undefined}
          totalCents={rows ? totalCents(rows) : 0}
        />
      }
      contentInsetAdjustmentBehavior="automatic"
      data={periods}
      keyExtractor={(period) => period.period}
      refreshControl={refreshControl}
      renderItem={({ item }) => (
        <UtilityCostMonthRow
          isExpanded={expandedPeriod === item.period}
          isPartial={isCurrentPeriod(item.period, today)}
          largestCents={largestPeriodCents}
          month={item}
          onSeeBills={() => {
            const bounds = periodBounds(item.period);
            router.navigate(drillDownLink({ ...bounds, propertyIds: scoped, category: UTILITIES_CATEGORY, label: MESSAGES.periodBillsFor(item.period) }));
          }}
          onToggle={() => setExpandedPeriod((open) => (open === item.period ? null : item.period))}
        />
      )}
      testID="utility-costs-list"
    />
  );
}
