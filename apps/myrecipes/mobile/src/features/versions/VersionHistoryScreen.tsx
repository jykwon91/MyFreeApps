import { COMPARE_VERSION_COUNT } from "@myrecipes/api-client/constants/versions";
import { useListVersionsQuery } from "@myrecipes/api-client/store/recipesApi";
import type { VersionSummary } from "@myrecipes/api-client/types/recipe/version";
import { newestFirst } from "@myrecipes/api-client/utils/newestFirst";
import { orderForCompare } from "@myrecipes/api-client/utils/orderForCompare";
import { toggleCompareId } from "@myrecipes/api-client/utils/toggleCompareId";
import { EmptyState, ListSeparator, MIN_TOUCH_TARGET, Skeleton, Toast, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { VERSION_HISTORY_MESSAGES as MESSAGES, VERSION_LIST_ENTRY_POINT } from "../../constants/versions";
import { useErrorSinceOpening } from "../../hooks/useErrorSinceOpening";
import { useOpenOnce } from "../../hooks/useOpenOnce";
import { isNotFoundError } from "../../utils/isNotFoundError";
import CompareBar from "./CompareBar";
import VersionListSkeleton from "./VersionListSkeleton";
import VersionRow from "./VersionRow";

/**
 * A recipe's versions, newest first, as the website's timeline lists them. Public like the recipe:
 * cooks and best ratings are the owner's, so the API leaves them out for anyone else.
 */
export default function VersionHistoryScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Asked for again on opening: a tweak since the list was cached adds a version.
  const { currentData, error, isError, refetch } = useListVersionsQuery(id, { refetchOnMountOrArgChange: true });
  const { dismissError, isErrorDismissed, refreshControl } = useRefresh(refetch, error);
  const [isComparing, setIsComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const versions = currentData ? newestFirst(currentData) : [];
  const latestId = versions[0]?.id;
  const hasFailed = useErrorSinceOpening(error, isError);
  const isGone = hasFailed && isNotFoundError(error);
  const isLoadFailed = hasFailed && !isGone && !currentData;
  // The list is only offered for a recipe with two or more versions, so the Compare bar holds its place while loading.
  const isLoading = !currentData && !hasFailed;
  useAnnouncement(isGone ? MESSAGES.notFoundHeading : isLoadFailed ? MESSAGES.loadFailedHeading : undefined);

  const openDiff = useOpenOnce((versionId: string, against?: string) => {
    router.push({
      pathname: "/recipes/[id]/versions/[vid]/diff",
      params: against
        ? { id, vid: versionId, against, from: VERSION_LIST_ENTRY_POINT }
        : { id, vid: versionId, from: VERSION_LIST_ENTRY_POINT },
    });
  });

  const openVersion = useOpenOnce((versionId: string) => {
    router.push({ pathname: "/recipes/[id]/versions/[vid]", params: { id, vid: versionId } });
  });

  function chooseRow(version: VersionSummary): void {
    if (isComparing) setPicked((current) => toggleCompareId(current, version.id));
    else openVersion(version.id);
  }

  function compare(): void {
    const [a, b] = versions.filter((version) => picked.includes(version.id));
    if (!a || !b) return;
    const target = orderForCompare(a, b);
    openDiff(target.versionId, target.against);
  }

  function stopComparing(): void {
    setIsComparing(false);
    setPicked([]);
  }

  function renderEmpty() {
    if (isLoadFailed) {
      return (
        <EmptyState
          action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }}
          body={MESSAGES.loadFailedBody}
          heading={MESSAGES.loadFailedHeading}
        />
      );
    }
    return <VersionListSkeleton />;
  }

  if (isGone) {
    return (
      <View style={{ flex: 1, padding: spacing.lg, backgroundColor: colors.background }}>
        <EmptyState
          action={{ label: MESSAGES.backToRecipes, onPress: () => router.replace("/") }}
          body={MESSAGES.notFoundBody}
          heading={MESSAGES.notFoundHeading}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {hasFailed && currentData && !isErrorDismissed ? (
        <Toast
          message={MESSAGES.updateFailed}
          onDismiss={dismissError}
          style={{ marginHorizontal: spacing.lg, marginTop: spacing.lg }}
          variant="error"
        />
      ) : null}
      {versions.length >= COMPARE_VERSION_COUNT || isLoading ? (
        <View style={{ padding: spacing.lg, paddingBottom: spacing.sm }}>
          {isLoading ? (
            <Skeleton height={MIN_TOUCH_TARGET} testID="compare-bar-skeleton" />
          ) : (
            <CompareBar
              isComparing={isComparing}
              onCancel={stopComparing}
              onCompare={compare}
              onStart={() => setIsComparing(true)}
              pickedCount={picked.length}
            />
          )}
        </View>
      ) : null}
      <FlatList
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={renderEmpty()}
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm }}
        data={versions}
        keyExtractor={(version) => version.id}
        refreshControl={refreshControl}
        renderItem={({ item }) => (
          <VersionRow
            isComparing={isComparing}
            isLatest={item.id === latestId}
            isPickDisabled={!picked.includes(item.id) && picked.length >= COMPARE_VERSION_COUNT}
            isPicked={picked.includes(item.id)}
            onChoose={chooseRow}
            version={item}
          />
        )}
        testID="version-list"
      />
    </View>
  );
}
