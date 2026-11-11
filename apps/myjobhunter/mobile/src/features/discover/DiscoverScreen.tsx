import { useDiscoveredJobsPages } from "@myjobhunter/api-client/hooks/useDiscoveredJobsPages";
import { useScoringActive } from "@myjobhunter/api-client/hooks/useScoringActive";
import { useScoringWindow } from "@myjobhunter/api-client/hooks/useScoringWindow";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import { inboxCoverageLine } from "@myjobhunter/api-client/utils/inboxCoverageLine";
import { savedSearchName } from "@myjobhunter/api-client/utils/savedSearchName";
import { unscoredCount } from "@myjobhunter/api-client/utils/unscoredCount";
import { EmptyState, LoadMoreFooter, OptionSheet, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { ALL_SOURCES, DISCOVER_SCREEN_MESSAGES as MESSAGES } from "../../constants/discoverScreen";
import { PAGED_LIST_MESSAGES } from "../../constants/pagedListMessages";
import DiscoveredJobCard from "./DiscoveredJobCard";
import DiscoverJobsSkeleton from "./DiscoverJobsSkeleton";
import DiscoverListHeader from "./DiscoverListHeader";
import SavedSearchSheet from "./SavedSearchSheet";

/**
 * The website's Discovery page: saved searches with refresh, schedule, edit and remove; the inbox and
 * saved postings a page at a time, filtered by saved search, with Apply, Save, Dismiss and Open; and
 * the scores filling in for a short while after a refresh.
 */
export default function DiscoverScreen() {
  const { colors, spacing } = useTheme();
  const [view, setView] = useState<DiscoverView>("inbox");
  const [chosenSourceId, setChosenSourceId] = useState<string>(ALL_SOURCES);
  const [isSourceSheetOpen, setIsSourceSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editing, setEditing] = useState<DiscoverySource | null>(null);
  const sourcesQuery = useListDiscoverySourcesQuery();
  const sources = sourcesQuery.data;
  // A saved search removed while chosen leaves the filter on every saved search.
  const chosenSource = sources?.find((source) => source.id === chosenSourceId);
  const sourceId = chosenSource?.id ?? ALL_SOURCES;
  const scoringWindow = useScoringWindow(sourceId || null);
  const isInbox = view === "inbox";
  const list = useDiscoveredJobsPages(sourceId ? { state: view, source_id: sourceId } : { state: view }, isInbox ? scoringWindow.pollingInterval : 0);
  const isScoringActive = useScoringActive(scoringWindow, isInbox ? unscoredCount(list.scoredCount, list.totalCount) : null);
  const { data: profile } = useGetProfileQuery();
  const { isRefreshing, refresh, refreshControl } = useRefresh(() => Promise.all([list.refetch(), sourcesQuery.refetch()]), list.error ?? sourcesQuery.error);
  const hasNoSources = sources !== undefined && sources.length === 0;
  // The website's inbox asks for a saved search first, whatever the postings say.
  const needsSavedSearch = isInbox && hasNoSources;
  const isCurrent = !list.isLoading && !list.isFiltering && list.loadError === undefined;
  const shown = isCurrent && !needsSavedSearch ? list.jobs : [];
  const sourceOptions = [{ value: ALL_SOURCES, label: MESSAGES.allSources }, ...(sources ?? []).map((source) => ({ value: source.id, label: savedSearchName(source) }))];

  useAnnouncement(isCurrent && !needsSavedSearch ? MESSAGES.listSummary(view, list.total) : undefined);
  useAnnouncement(isInbox && isScoringActive ? MESSAGES.scoring : undefined);

  function emptyList() {
    if (needsSavedSearch) return <EmptyState body={MESSAGES.noSavedSearchesBody} heading={MESSAGES.noSavedSearchesHeading} />;
    if (list.isLoading || list.isFiltering || sourcesQuery.isLoading) return <DiscoverJobsSkeleton />;
    if (!isCurrent) {
      return (
        <EmptyState
          action={{ label: MESSAGES.tryAgain, onPress: refresh, isLoading: isRefreshing }}
          body={MESSAGES.tryAgainOffer}
          heading={isInbox ? MESSAGES.couldntLoadInbox : MESSAGES.couldntLoadSaved}
        />
      );
    }
    const showAll = sourceId ? { label: MESSAGES.showAllSources, onPress: () => setChosenSourceId(ALL_SOURCES) } : undefined;
    return isInbox ? (
      <EmptyState action={showAll} body={MESSAGES.inboxEmptyBody} heading={MESSAGES.inboxEmptyHeading} />
    ) : (
      <EmptyState action={showAll} body={MESSAGES.savedEmptyBody} heading={MESSAGES.savedEmptyHeading} />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        ListEmptyComponent={emptyList()}
        ListHeaderComponent={
          <DiscoverListHeader
            areSourcesLoading={sourcesQuery.isLoading}
            coverageLine={isInbox && shown.length > 0 ? inboxCoverageLine(list.scoredCount, list.totalCount) : null}
            isSourcesError={sourcesQuery.isError && sources === undefined}
            isStale={isCurrent && list.error !== undefined && !list.isLoadMoreError}
            onChangeView={setView}
            onChooseSource={() => setIsSourceSheetOpen(true)}
            onEditSavedSearch={setEditing}
            onNewSavedSearch={() => setIsCreating(true)}
            onSavedSearchRefreshed={scoringWindow.open}
            onRetrySources={async () => {
              await sourcesQuery.refetch();
            }}
            sourceLabel={chosenSource ? savedSearchName(chosenSource) : MESSAGES.allSources}
            sources={sources}
            view={view}
          />
        }
        contentContainerStyle={{ gap: spacing.md, padding: spacing.lg }}
        contentInsetAdjustmentBehavior="automatic"
        ListFooterComponent={
          shown.length > 0 && list.hasNextPage ? (
            <LoadMoreFooter
              isError={list.isLoadMoreError}
              isLoading={list.isFetchingNextPage}
              messages={PAGED_LIST_MESSAGES}
              onLoadMore={list.loadMore}
              shown={list.jobs.length}
              total={list.total}
            />
          ) : undefined
        }
        data={shown}
        keyExtractor={(job) => job.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <DiscoveredJobCard isScoringInFlight={isInbox && isScoringActive} job={item} profileUpdatedAt={profile?.updated_at ?? null} sources={sources ?? []} />
        )}
        testID="discover-list"
      />
      <OptionSheet
        isOpen={isSourceSheetOpen}
        onClose={() => setIsSourceSheetOpen(false)}
        onSelect={(next) => {
          setIsSourceSheetOpen(false);
          setChosenSourceId(next);
        }}
        options={sourceOptions}
        title={MESSAGES.sourceSheetTitle}
        value={sourceId}
      />
      {isCreating ? <SavedSearchSheet onClose={() => setIsCreating(false)} /> : null}
      {editing ? <SavedSearchSheet key={editing.id} onClose={() => setEditing(null)} source={editing} /> : null}
    </View>
  );
}
