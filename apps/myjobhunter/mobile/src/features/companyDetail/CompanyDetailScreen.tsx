import { useApplicationsPages } from "@myjobhunter/api-client/hooks/useApplicationsPages";
import { useGetCompanyQuery, useGetCompanyResearchQuery } from "@myjobhunter/api-client/store/companiesApi";
import { companyDeleteState } from "@myjobhunter/api-client/utils/companyDeleteState";
import { isNotFound } from "@platform/core/utils/isNotFound";
import { Banner, EmptyState, SHOWING_LAST_LOADED_MESSAGE, useRefresh, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { APPLICATION_SORTS, DEFAULT_APPLICATION_SORT } from "../../constants/applicationSorts";
import { COMPANY_DETAIL_MESSAGES as MESSAGES } from "../../constants/companyDetail";
import type { ApplicationSortKey } from "../../types/ApplicationSortKey";
import type { CompanyDetailScreenProps } from "../../types/CompanyDetailScreenProps";
import CompanyApplicationsSection from "./CompanyApplicationsSection";
import CompanyDeleteAction from "./CompanyDeleteAction";
import CompanyDetailSkeleton from "./CompanyDetailSkeleton";
import CompanyHeader from "./CompanyHeader";
import CompanyOverviewSection from "./CompanyOverviewSection";
import CompanyResearchSection from "./CompanyResearchSection";

/**
 * One company, as the website's company page: its header and overview, the AI research, the
 * applications there, and Delete. Delete sits at the bottom, under the applications that decide it.
 */
export default function CompanyDetailScreen({ id }: CompanyDetailScreenProps) {
  const { spacing } = useTheme();
  // Set once a delete lands, so Delete can't be pressed again while the screen goes back.
  const [isLeaving, setIsLeaving] = useState(false);
  const [sortKey, setSortKey] = useState<ApplicationSortKey>(DEFAULT_APPLICATION_SORT);
  const sort = APPLICATION_SORTS[sortKey];
  const { currentData: company, error, isFetching, refetch } = useGetCompanyQuery(id);
  const research = useGetCompanyResearchQuery(id);
  const applications = useApplicationsPages({ company_id: id, sort: sort.field, order: sort.direction });
  const { refresh, isRefreshing, refreshControl } = useRefresh(
    () => Promise.all([refetch(), research.refetch(), applications.refetch()]),
    error,
  );

  useEffect(() => {
    if (isLeaving) router.back();
  }, [isLeaving]);

  if (!company && (isFetching || !error)) return <CompanyDetailSkeleton />;
  if (!company) {
    const isGone = isNotFound(error);
    return (
      <EmptyState
        action={
          isGone
            ? { label: MESSAGES.back, onPress: () => router.back() }
            : { label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }
        }
        body={isGone ? MESSAGES.maybeDeleted : MESSAGES.tryAgainOffer}
        heading={isGone ? MESSAGES.cantFind : MESSAGES.couldntLoad}
      />
    );
  }

  // A failed refresh keeps what was loaded on screen under a banner; a failed next page says so itself.
  const isStale = Boolean(error) || (Boolean(applications.error) && applications.loadError === undefined && !applications.isLoadMoreError);

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.xl, padding: spacing.lg }}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={refreshControl}
      testID="company-detail"
    >
      {isStale ? <Banner message={SHOWING_LAST_LOADED_MESSAGE} /> : null}
      <CompanyHeader company={company} />
      <CompanyOverviewSection company={company} />
      <CompanyResearchSection companyId={id} companyName={company.name} />
      <CompanyApplicationsSection companyName={company.name} list={applications} onSortChange={setSortKey} sortKey={sortKey} />
      <CompanyDeleteAction
        company={company}
        deleteState={companyDeleteState(applications)}
        isLeaving={isLeaving}
        onDeleted={() => setIsLeaving(true)}
        onRefused={() => void applications.refetch()}
      />
    </ScrollView>
  );
}
