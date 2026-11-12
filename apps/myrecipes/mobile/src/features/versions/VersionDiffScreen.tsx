import { VERSION_COPY } from "@myrecipes/api-client/constants/versions";
import { useGetDiffQuery, useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import { diffErrorMessage } from "@myrecipes/api-client/utils/diffErrorMessage";
import { EmptyState, Toast, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { VERSION_DIFF_MESSAGES as MESSAGES } from "../../constants/versions";
import { useErrorSinceOpening } from "../../hooks/useErrorSinceOpening";
import { diffBackTitle } from "../../utils/diffBackTitle";
import { goBackOrOpenRecipe } from "../../utils/goBackOrOpenRecipe";
import VersionDiffContent from "./VersionDiffContent";
import VersionDiffSkeleton from "./VersionDiffSkeleton";

/**
 * What changed between two versions: a version against its parent, or against `against` when two
 * were picked to compare. Public like the website's; the server works the diff out.
 */
export default function VersionDiffScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ id: string; vid: string; against?: string; from?: string }>();
  const { currentData: diff, error, isError, refetch } = useGetDiffQuery(
    { recipeId: params.id, versionId: params.vid, against: params.against || undefined },
    { refetchOnMountOrArgChange: true },
  );
  // Only for whether "Tweak this recipe" shows, which is the owner's. Usually cached from the recipe.
  const isOwner = useGetRecipeQuery(params.id).currentData?.is_owner ?? false;
  const { dismissError, isErrorDismissed, refreshControl } = useRefresh(refetch, error);

  const hasFailed = useErrorSinceOpening(error, isError);
  const isLoadFailed = hasFailed && !diff;
  useAnnouncement(isLoadFailed ? VERSION_COPY.loadFailedHeading : undefined);

  function renderBody() {
    if (diff) return <VersionDiffContent diff={diff} isOwner={isOwner} recipeId={params.id} />;
    if (isLoadFailed) {
      return (
        <EmptyState
          action={{ label: MESSAGES.goBack, onPress: () => goBackOrOpenRecipe(params.id) }}
          body={diffErrorMessage(error)}
          heading={VERSION_COPY.loadFailedHeading}
        />
      );
    }
    return <VersionDiffSkeleton hasTweak={isOwner} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: MESSAGES.screenTitle, headerBackTitle: diffBackTitle(params.from) }} />
      {hasFailed && diff && !isErrorDismissed ? (
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
        testID="version-diff"
      >
        {renderBody()}
      </ScrollView>
    </View>
  );
}
