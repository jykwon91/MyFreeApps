import { useGetDocumentsQuery } from "@mybookkeeper/api-client/store/documentsApi";
import { useGetSummaryQuery, useGetSummaryYearsQuery } from "@mybookkeeper/api-client/store/summaryApi";
import { useGetTransactionReviewCountQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { Banner, EmptyState, SegmentedControl, Skeleton, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ALL_DOCUMENTS } from "../../constants/documents";
import { HOME_PERIODS, type HomePeriod } from "../../constants/home";
import { SHOWING_LAST_LOADED_MESSAGE } from "../../constants/offline";
import { useToday } from "../../lib/useToday";
import { periodRange } from "../transactions/transactionFilters";
import { useCanWrite } from "../workspace/useCanWrite";
import HomeCard from "./HomeCard";
import { numbersFailedMessage } from "./homeDisplay";
import HomeSectionError from "./HomeSectionError";
import NumbersCard from "./NumbersCard";
import PropertyTotals from "./PropertyTotals";
import WaitingCard from "./WaitingCard";

export default function HomeScreen() {
  const { spacing } = useTheme();
  const canWrite = useCanWrite();
  const today = useToday();
  const [period, setPeriod] = useState<HomePeriod>("thisMonth");
  const summaryParams = useMemo(() => {
    const range = periodRange(period, today);
    return { startDate: range.start_date, endDate: range.end_date };
  }, [period, today]);

  // currentData, never data: switching period must not show the other period's numbers.
  const summary = useGetSummaryQuery(summaryParams);
  const years = useGetSummaryYearsQuery();
  const reviewCount = useGetTransactionReviewCountQuery();
  const documents = useGetDocumentsQuery(ALL_DOCUMENTS);

  const { refreshControl } = useRefresh(
    () => Promise.all([summary.refetch(), years.refetch(), reviewCount.refetch(), documents.refetch()]),
    summary.error ?? years.error ?? reviewCount.error ?? documents.error,
  );

  const hasNothingYet = years.data?.length === 0 && reviewCount.data?.count === 0 && documents.data?.length === 0;
  const isShowingOldData =
    (summary.isError && summary.currentData) || (reviewCount.isError && reviewCount.data) || (documents.isError && documents.data);

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
          <SegmentedControl accessibilityLabel="Which period to show" onChange={setPeriod} segments={HOME_PERIODS} value={period} />
          {summary.currentData ? (
            <>
              <NumbersCard period={period} summary={summary.currentData} />
              <PropertyTotals period={period} properties={summary.currentData.by_property} />
            </>
          ) : summary.isFetching ? (
            <View accessibilityLabel="Loading your numbers" accessible style={{ gap: spacing.sm }} testID="home-numbers-skeleton">
              <Skeleton height={14} width="20%" />
              <Skeleton height={36} width="55%" />
              <Skeleton height={44} width="70%" />
            </View>
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
