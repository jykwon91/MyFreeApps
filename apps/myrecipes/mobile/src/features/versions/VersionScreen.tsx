import { useGetRecipeQuery, useGetVersionQuery, useListVersionsQuery } from "@myrecipes/api-client/store/recipesApi";
import { EmptyState, Toast, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { VERSIONS_BACK_TITLE } from "../../constants/backTitles";
import { VERSION_VIEW_MESSAGES as MESSAGES } from "../../constants/versions";
import { useErrorSinceOpening } from "../../hooks/useErrorSinceOpening";
import { goBackOrOpenRecipe } from "../../utils/goBackOrOpenRecipe";
import { isNotFoundError } from "../../utils/isNotFoundError";
import VersionContent from "./VersionContent";
import VersionSkeleton from "./VersionSkeleton";

/**
 * One of a recipe's versions in full, opened from its version history, as the website shows the
 * version picked in its timeline. Public like the recipe; logging a cook of it is the owner's.
 */
export default function VersionScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ id: string; vid: string }>();
  const { currentData: version, error, isError, refetch } = useGetVersionQuery(
    { recipeId: params.id, versionId: params.vid },
    { refetchOnMountOrArgChange: true },
  );
  // For whether it's the latest and whether the owner can log a cook. Usually cached from the recipe.
  const recipe = useGetRecipeQuery(params.id).currentData;
  const isOwner = recipe?.is_owner ?? false;
  // This version's timeline entry, usually cached from Version history: its owner-only cooks and best
  // rating, and, before the version itself loads, whether it's v1. A cook logged here refreshes it.
  const { summary } = useListVersionsQuery(params.id, {
    selectFromResult: ({ currentData }) => ({ summary: currentData?.find((entry) => entry.id === params.vid) }),
  });
  // Only v1 has no version it was based on, so no What changed. Unknown until the list loads.
  const isFirst = summary?.version_number === 1;
  const { dismissError, isErrorDismissed, refreshControl } = useRefresh(refetch, error);

  const hasFailed = useErrorSinceOpening(error, isError);
  const isGone = hasFailed && isNotFoundError(error);
  const isLoadFailed = hasFailed && !isGone && !version;
  useAnnouncement(isGone ? MESSAGES.notFoundHeading : isLoadFailed ? MESSAGES.loadFailedHeading : undefined);

  function renderBody() {
    if (version) {
      return (
        <VersionContent
          isLatest={version.id === recipe?.latest_version?.id}
          isOwner={isOwner}
          recipeId={params.id}
          summary={summary}
          version={version}
        />
      );
    }
    if (isLoadFailed) {
      return (
        <EmptyState
          action={{ label: MESSAGES.tryAgain, onPress: () => void refetch() }}
          body={MESSAGES.loadFailedBody}
          heading={MESSAGES.loadFailedHeading}
        />
      );
    }
    // What changed, then the owner's I made it.
    return <VersionSkeleton buttonCount={(isFirst ? 0 : 1) + (isOwner ? 1 : 0)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: VERSIONS_BACK_TITLE }} />
      {isGone ? (
        <View style={{ flex: 1, padding: spacing.lg }}>
          <EmptyState
            action={{ label: MESSAGES.goBack, onPress: () => goBackOrOpenRecipe(params.id) }}
            body={MESSAGES.notFoundBody}
            heading={MESSAGES.notFoundHeading}
          />
        </View>
      ) : (
        <>
          {hasFailed && version && !isErrorDismissed ? (
            <Toast
              message={MESSAGES.updateFailed}
              onDismiss={dismissError}
              style={{ margin: spacing.lg, marginBottom: 0 }}
              variant="error"
            />
          ) : null}
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
            refreshControl={refreshControl}
            testID="version-view"
          >
            {renderBody()}
          </ScrollView>
        </>
      )}
    </View>
  );
}
