import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { useGetPropertiesQuery } from "@mybookkeeper/api-client/store/propertiesApi";
import { useGetInsurancePremiumComparisonQuery } from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import { useGetPendingReceiptsQuery } from "@mybookkeeper/api-client/store/rentReceiptsApi";
import { useGetSummaryQuery, useGetSummaryYearsQuery } from "@mybookkeeper/api-client/store/summaryApi";
import { useGetTransactionReviewCountQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { useGetUtilityPlanRateComparisonQuery, useGetUtilityPlanRenewalAlertsQuery } from "@mybookkeeper/api-client/store/utilityPlansApi";
import { activePropertyIds } from "@mybookkeeper/api-client/utils/activePropertyIds";
import { ALL_SUMMARY_CATEGORIES, filterSummaryByCategories, isCategoryFilterActive } from "@mybookkeeper/api-client/utils/categoryFilter";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, SegmentedControl, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ALL_DOCUMENTS } from "../../constants/documents";
import { HOME_PERIODS, HOME_RECEIPTS_ARGS, MONEY_ANALYSIS_LINK, type HomePeriod } from "../../constants/home";
import { MONEY_ANALYSIS_MESSAGES } from "../../constants/moneyAnalysis";
import { useToday } from "../../lib/useToday";
import type { AnalysisScope } from "../../types/AnalysisScope";
import PropertyPickerField from "../analyticsControls/PropertyPickerField";
import CategoryPickerField from "../moneyAnalysis/CategoryPickerField";
import { isEmptySummary } from "../moneyAnalysis/moneyAnalysisDisplay";
import { periodRange } from "../transactions/transactionFilters";
import { useCanWrite } from "../workspace/useCanWrite";
import HomeAlerts from "./HomeAlerts";
import HomeCard from "./HomeCard";
import HomeLinkRow from "./HomeLinkRow";
import { numbersFailedMessage, periodHasMonths } from "./homeDisplay";
import HomeSectionError from "./HomeSectionError";
import MonthlyChart from "./MonthlyChart";
import MonthlyChartSkeleton from "./MonthlyChartSkeleton";
import NumbersCard from "./NumbersCard";
import PropertyTotals from "./PropertyTotals";
import WaitingCard from "./WaitingCard";
import WhereItWent from "./WhereItWent";
import WhereItWentSkeleton from "./WhereItWentSkeleton";

export default function HomeScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const today = useToday();
  const [period, setPeriod] = useState<HomePeriod>("thisMonth");
  // Not kept between visits, as on the web Dashboard.
  const [propertyIds, setPropertyIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Set<string>>(() => new Set(ALL_SUMMARY_CATEGORIES));
  const { data: properties = [] } = useGetPropertiesQuery();
  const isFilteringCategories = isCategoryFilterActive(categories);
  const isFiltered = propertyIds.length > 0 || isFilteringCategories;
  const summaryParams = useMemo(() => {
    const range = periodRange(period, today);
    return { startDate: range.start_date, endDate: range.end_date, propertyIds: propertyIds.length > 0 ? propertyIds : undefined };
  }, [period, today, propertyIds]);
  // What a number opens is cut the same way: every property chosen is no property filter.
  const scope = useMemo<AnalysisScope>(
    () => ({
      startDate: summaryParams.startDate,
      endDate: summaryParams.endDate,
      propertyIds: activePropertyIds(propertyIds, properties.length),
      categories: isFilteringCategories ? [...categories] : undefined,
    }),
    [summaryParams, propertyIds, properties.length, categories, isFilteringCategories],
  );
  const showEverything = () => {
    setPropertyIds([]);
    setCategories(new Set(ALL_SUMMARY_CATEGORIES));
  };

  // currentData, never data: switching period or properties must not show the other choice's numbers.
  const summary = useGetSummaryQuery(summaryParams);
  // The category filter narrows what came back, as the web Dashboard does; the server's own totals otherwise.
  const shown = useMemo(
    () => (summary.currentData && isFilteringCategories ? filterSummaryByCategories(summary.currentData, categories) : summary.currentData),
    [summary.currentData, categories, isFilteringCategories],
  );
  const years = useGetSummaryYearsQuery();
  const reviewCount = useGetTransactionReviewCountQuery();
  const documents = useGetDocumentsQuery(ALL_DOCUMENTS);
  const receipts = useGetPendingReceiptsQuery(HOME_RECEIPTS_ARGS, { skip: !canWrite });
  const renewals = useGetUtilityPlanRenewalAlertsQuery();
  const utilityRates = useGetUtilityPlanRateComparisonQuery();
  const insurancePremiums = useGetInsurancePremiumComparisonQuery();
  const alerts = [renewals, utilityRates, insurancePremiums];

  const { refreshControl } = useRefresh(
    () =>
      Promise.all([
        summary.refetch(),
        years.refetch(),
        reviewCount.refetch(),
        documents.refetch(),
        canWrite ? receipts.refetch() : undefined,
        ...alerts.map((alert) => alert.refetch()),
      ]),
    summary.error ??
      years.error ??
      reviewCount.error ??
      documents.error ??
      (canWrite ? receipts.error : undefined) ??
      alerts.find((alert) => alert.error)?.error,
  );

  const hasNothingYet = years.data?.length === 0 && reviewCount.data?.count === 0 && documents.data?.length === 0;
  const isShowingOldData =
    (summary.isError && summary.currentData) ||
    (reviewCount.isError && reviewCount.data) ||
    (documents.isError && documents.data) ||
    (receipts.isError && receipts.data) ||
    alerts.some((alert) => alert.isError && alert.data);

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }}
      refreshControl={refreshControl}
      testID="home-screen"
    >
      {isShowingOldData ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      {hasNothingYet ? (
        <EmptyState
          action={canWrite ? { label: "Take a photo", onPress: () => router.push("/camera") } : undefined}
          body={canWrite ? "Snap a receipt and I'll start your books." : "Numbers will show up here once someone adds a document."}
          heading="Nothing here yet"
        />
      ) : (
        <>
          <WaitingCard />
          <HomeAlerts />
          <SegmentedControl accessibilityLabel="Which period to show" onChange={setPeriod} segments={HOME_PERIODS} value={period} />
          <View style={{ gap: spacing.md }}>
            <PropertyPickerField onChange={setPropertyIds} properties={properties} selectedIds={propertyIds} />
            <CategoryPickerField onChange={setCategories} selected={categories} />
          </View>
          {shown && isFiltered && isEmptySummary(shown) ? (
            <EmptyState
              action={{ label: MONEY_ANALYSIS_MESSAGES.clear, onPress: showEverything }}
              body={MONEY_ANALYSIS_MESSAGES.noneBody}
              heading={MONEY_ANALYSIS_MESSAGES.noneHeading}
            />
          ) : shown ? (
            <>
              <NumbersCard period={period} summary={shown} />
              <MonthlyChart byMonth={shown.by_month} scope={scope} />
              <PropertyTotals period={period} properties={shown.by_property} />
              <WhereItWent byCategory={shown.by_category} period={period} scope={scope} />
              <HomeLinkRow label="Explore all your numbers" onPress={() => router.navigate(MONEY_ANALYSIS_LINK)} />
            </>
          ) : summary.isFetching ? (
            <>
              <View accessibilityLabel="Loading your numbers" accessible style={{ gap: spacing.sm }} testID="home-numbers-skeleton">
                <Skeleton height={14} width="20%" />
                <Skeleton height={36} width="55%" />
                <Skeleton height={44} width="70%" />
              </View>
              {periodHasMonths(period) ? <MonthlyChartSkeleton /> : null}
              <WhereItWentSkeleton />
            </>
          ) : (
            <HomeCard title="Your numbers">
              <HomeSectionError
                message={numbersFailedMessage(period)}
                onRetry={async () => {
                  await summary.refetch();
                }}
              />
            </HomeCard>
          )}
        </>
      )}
    </ScrollView>
  );
}
