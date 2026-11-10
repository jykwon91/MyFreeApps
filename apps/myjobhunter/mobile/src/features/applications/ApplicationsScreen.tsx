import { useListApplicationsQuery } from "@myjobhunter/api-client/store/applicationsApi";
import { EmptyState, OptionSheet, useOpenWebsite, useRefresh } from "@platform/mobile";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { WEB_BASE_URL } from "../../constants/api";
import { APPLICATION_SORT_OPTIONS, APPLICATION_SORTS, DEFAULT_APPLICATION_SORT } from "../../constants/applicationSorts";
import { APPLICATION_MESSAGES as MESSAGES } from "../../constants/applications";
import { APPLICATIONS_TAB } from "../../constants/tabs";
import type { ApplicationSortKey } from "../../types/ApplicationSortKey";
import { sortApplications } from "../../utils/sortApplications";
import ApplicationRow from "./ApplicationRow";
import ApplicationsListHeader from "./ApplicationsListHeader";
import ApplicationsSkeleton from "./ApplicationsSkeleton";

export default function ApplicationsScreen() {
  const openWebsite = useOpenWebsite();
  const [sortKey, setSortKey] = useState<ApplicationSortKey>(DEFAULT_APPLICATION_SORT);
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const { data, error, isLoading, refetch } = useListApplicationsQuery();
  const { isRefreshing, refresh, refreshControl } = useRefresh(refetch, error);
  const sort = APPLICATION_SORTS[sortKey];
  const rows = useMemo(() => sortApplications(data?.items ?? [], sort), [data, sort]);

  // Adding takes the website's job-link reader and company matching, which aren't on the phone yet.
  const addOnWebsite = () => openWebsite(WEB_BASE_URL, APPLICATIONS_TAB.webPath);

  // Once anything has loaded, a failed refresh keeps it on screen (even an empty list) under a banner.
  const emptyList = isLoading ? (
    <ApplicationsSkeleton />
  ) : error && !data ? (
    <EmptyState action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }} body={MESSAGES.tryAgainOffer} heading={MESSAGES.couldntLoadList} />
  ) : (
    <EmptyState action={{ label: MESSAGES.addOnWebsite, onPress: addOnWebsite }} body={MESSAGES.noneBody} heading={MESSAGES.noneHeading} />
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ListEmptyComponent={emptyList}
        ListHeaderComponent={
          data && (error || rows.length > 0) ? (
            <ApplicationsListHeader
              hasRows={rows.length > 0}
              isStale={Boolean(error)}
              onAdd={addOnWebsite}
              onSort={() => setIsSortSheetOpen(true)}
              sortLabel={sort.label}
            />
          ) : undefined
        }
        data={rows}
        keyExtractor={(application) => application.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => <ApplicationRow application={item} onPress={() => void openWebsite(WEB_BASE_URL, `/applications/${item.id}`)} />}
        testID="applications-list"
      />
      <OptionSheet
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        onSelect={(next) => {
          setIsSortSheetOpen(false);
          setSortKey(next);
        }}
        options={APPLICATION_SORT_OPTIONS}
        title={MESSAGES.sortTitle}
        value={sortKey}
      />
    </View>
  );
}
