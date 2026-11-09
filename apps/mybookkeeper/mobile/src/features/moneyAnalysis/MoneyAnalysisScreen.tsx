import { ALL_SUMMARY_CATEGORIES, filterSummaryByCategories, isCategoryFilterActive } from "@mybookkeeper/api-client/utils/categoryFilter";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetSummaryQuery, useGetSummaryYearsQuery } from "@mybookkeeper/api-client/store/summaryApi";
import type { CompareMode } from "@mybookkeeper/api-client/types/analytics/compare-mode";
import { monthlyAverage } from "@mybookkeeper/api-client/utils/summaryAverages";
import { Banner, EmptyState, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView } from "react-native";
import { COMPARE_AGAINST_LABEL, MONEY_ANALYSIS_MESSAGES as MESSAGES } from "../../constants/moneyAnalysis";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useToday } from "../../lib/useToday";
import type { AnalysisScope } from "../../types/AnalysisScope";
import type { AnalysisSelection } from "../../types/AnalysisSelection";
import AnalysisControls from "../analyticsControls/AnalysisControls";
import ComparisonNotice from "../analyticsControls/ComparisonNotice";
import { analysisChoices, currentSelection, selectionComparison, selectionFor, summaryDates } from "../analyticsControls/analysisPeriod";
import { drillDownLink } from "../drillDown/drillDownLink";
import CategoriesCard from "./CategoriesCard";
import CategoryPickerField from "./CategoryPickerField";
import { isEmptySummary } from "./moneyAnalysisDisplay";
import { kindDrillDown } from "./moneyAnalysisDrillDowns";
import MoneyAnalysisSkeleton from "./MoneyAnalysisSkeleton";
import MonthByMonthCard from "./MonthByMonthCard";
import MonthlyAverageCard from "./MonthlyAverageCard";
import MoreWaysToLook from "./MoreWaysToLook";
import PropertiesCard from "./PropertiesCard";
import TotalsCard from "./TotalsCard";

/** Everything the web Dashboard analyses: any dates, a comparison, property and category filters, and the transactions behind each number. */
export default function MoneyAnalysisScreen() {
  const { spacing } = useTheme();
  const today = useToday();
  const [chosen, setSelection] = useState<AnalysisSelection>(() => selectionFor("ytd", today));
  const selection = useMemo(() => currentSelection(chosen, today), [chosen, today]);
  const [compare, setCompare] = useState<CompareMode>("none");
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Set<string>>(() => new Set(ALL_SUMMARY_CATEGORIES));

  const years = useGetSummaryYearsQuery();
  const { data: properties = [] } = useGetPropertiesQuery();
  const choices = useMemo(() => analysisChoices(today, years.data), [today, years.data]);
  const isFiltering = isCategoryFilterActive(categories);
  const scope = useMemo<AnalysisScope>(
    () => ({ ...summaryDates(selection.range), propertyIds: propertyIds.length > 0 ? propertyIds : undefined, categories: isFiltering ? [...categories] : undefined }),
    [selection.range, propertyIds, categories, isFiltering],
  );
  const comparison = useMemo(() => selectionComparison(selection, compare), [selection, compare]);
  const previousScope = useMemo<AnalysisScope | null>(() => (comparison ? { ...summaryDates(comparison), propertyIds: scope.propertyIds } : null), [comparison, scope.propertyIds]);
  const summaryScope = useMemo(() => ({ startDate: scope.startDate, endDate: scope.endDate, propertyIds: scope.propertyIds }), [scope.startDate, scope.endDate, scope.propertyIds]);

  // currentData, never data: changing the dates must not show the other dates' numbers.
  const summary = useGetSummaryQuery(summaryScope);
  const previous = useGetSummaryQuery(previousScope ?? summaryScope, { skip: previousScope === null });
  const { refresh, refreshControl } = useRefresh(async () => {
    await Promise.all([summary.refetch(), previousScope ? previous.refetch() : undefined, years.refetch()]);
  }, summary.error ?? (previousScope ? previous.error : undefined));

  // With every category on, the server's own totals are shown as they are.
  const shown = useMemo(() => (summary.currentData && isFiltering ? filterSummaryByCategories(summary.currentData, categories) : (summary.currentData ?? null)), [summary.currentData, categories, isFiltering]);
  const shownPrevious = useMemo(() => {
    if (!previous.currentData || !previousScope) return null;
    return isFiltering ? filterSummaryByCategories(previous.currentData, categories) : previous.currentData;
  }, [previous.currentData, previousScope, categories, isFiltering]);
  const comparisonFailed = previousScope !== null && !previous.currentData && !previous.isFetching && previous.isError;
  const isComparisonLoading = previousScope !== null && !previous.currentData && previous.isFetching;
  const againstLabel = compare === "none" ? "" : COMPARE_AGAINST_LABEL[compare];
  const average = shown ? monthlyAverage(shown.by_month) : null;
  const previousAverage = shownPrevious ? monthlyAverage(shownPrevious.by_month) : null;
  const open = (kind: "revenue" | "expenses") => router.navigate(drillDownLink(kindDrillDown(kind, scope)));

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} refreshControl={refreshControl} testID="analysis-screen">
      {summary.isError && summary.currentData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <AnalysisControls
        choices={choices}
        compare={compare}
        onCompare={setCompare}
        onPropertyIds={setPropertyIds}
        onRetryYears={async () => {
          await years.refetch();
        }}
        onSelection={setSelection}
        propertyIds={propertyIds}
        properties={properties}
        selection={selection}
        today={today}
        yearsFailed={years.isError && !years.data}
      >
        <CategoryPickerField onChange={setCategories} selected={categories} />
      </AnalysisControls>
      {shown ? (
        isEmptySummary(shown) ? (
          <EmptyState
            action={isFiltering ? { label: MESSAGES.clear, onPress: () => setCategories(new Set(ALL_SUMMARY_CATEGORIES)) } : undefined}
            body={MESSAGES.noneBody}
            heading={MESSAGES.noneHeading}
          />
        ) : (
          <>
            <ComparisonNotice
              failedMessage={MESSAGES.comparisonFailed}
              hasFailed={comparisonFailed}
              isLoading={isComparisonLoading}
              onRetry={async () => {
                await previous.refetch();
              }}
            />
            <TotalsCard againstLabel={againstLabel} onOpen={open} previous={shownPrevious} summary={shown} />
            {average ? <MonthlyAverageCard average={average} againstLabel={againstLabel} previous={previousAverage} /> : null}
            <MonthByMonthCard byMonth={shown.by_month} byMonthExpense={shown.by_month_expense} scope={scope} />
            <PropertiesCard againstLabel={againstLabel} monthly={shown.by_property_month} previous={shownPrevious ? shownPrevious.by_property : null} properties={shown.by_property} scope={scope} />
            <CategoriesCard againstLabel={againstLabel} byCategory={shown.by_category} previous={shownPrevious ? shownPrevious.by_category : null} scope={scope} />
          </>
        )
      ) : summary.isFetching ? (
        <MoneyAnalysisSkeleton />
      ) : (
        <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh }} body={MESSAGES.checkConnection} heading={MESSAGES.couldntLoad} />
      )}
      <MoreWaysToLook />
    </ScrollView>
  );
}
