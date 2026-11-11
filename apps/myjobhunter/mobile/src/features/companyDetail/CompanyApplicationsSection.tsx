import { OptionSheet, PickerField, useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { APPLICATION_SORTS } from "../../constants/applicationSorts";
import { COMPANY_APPLICATION_SORT_OPTIONS, COMPANY_APPLICATIONS_MESSAGES as MESSAGES } from "../../constants/companyApplications";
import type { CompanyApplicationsSectionProps } from "../../types/CompanyApplicationsSectionProps";
import SectionError from "../applicationDetail/SectionError";
import SectionHeading from "../applicationDetail/SectionHeading";
import CompanyApplicationRow from "./CompanyApplicationRow";
import CompanyApplicationSkeletonRows from "./CompanyApplicationSkeletonRows";
import CompanyApplicationsMore from "./CompanyApplicationsMore";

/** The website's table of a company's applications: sorted on the server, a page at a time, each opening its own screen. */
export default function CompanyApplicationsSection({ companyName, list, sortKey, onSortChange }: CompanyApplicationsSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const isLoaded = !list.isLoading && list.loadError === undefined;

  let body: ReactNode;
  if (list.isLoading || list.isSorting) {
    // A new sort starts over from its first page; the old order's rows would be wrong.
    body = (
      <View accessible accessibilityLabel={MESSAGES.loading} accessibilityRole="progressbar">
        <CompanyApplicationSkeletonRows />
      </View>
    );
  } else if (list.loadError !== undefined) {
    body = (
      <SectionError
        message={MESSAGES.couldntLoad}
        onRetry={async () => {
          await list.refetch();
        }}
        retryLabel={MESSAGES.tryAgain}
      />
    );
  } else if (list.applications.length === 0) {
    body = <Text style={{ fontSize: fontSize.md, color: colors.mutedForeground }}>{MESSAGES.none}</Text>;
  } else {
    body = (
      <View style={{ gap: spacing.sm }}>
        {list.applications.map((application) => (
          <CompanyApplicationRow application={application} key={application.id} onPress={() => router.push(`/applications/${application.id}`)} />
        ))}
        {list.isFetchingNextPage ? <CompanyApplicationSkeletonRows /> : null}
        {list.hasNextPage ? (
          <CompanyApplicationsMore
            isError={list.isLoadMoreError}
            isLoading={list.isFetchingNextPage}
            onLoadMore={list.loadMore}
            shown={list.applications.length}
            total={list.total}
          />
        ) : null}
      </View>
    );
  }

  // Sorting is offered once there's more than one row to order, and kept while a new order loads.
  const canSort = list.isSorting || (isLoaded && list.applications.length > 1);

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading count={isLoaded ? list.total : undefined} title={MESSAGES.heading(companyName)} />
      {canSort ? <PickerField label={MESSAGES.sort} onPress={() => setIsSortSheetOpen(true)} valueLabel={APPLICATION_SORTS[sortKey].label} /> : null}
      {body}
      <OptionSheet
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        onSelect={(next) => {
          setIsSortSheetOpen(false);
          onSortChange(next);
        }}
        options={COMPANY_APPLICATION_SORT_OPTIONS}
        title={MESSAGES.sortTitle}
        value={sortKey}
      />
    </View>
  );
}
