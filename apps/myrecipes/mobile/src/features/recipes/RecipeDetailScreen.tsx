import { useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import { EmptyState, Toast, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { useErrorSinceOpening } from "../../hooks/useErrorSinceOpening";
import { isNotFoundError } from "../../utils/isNotFoundError";
import { recipeBackTitle } from "../../utils/recipeBackTitle";
import RecipeContent from "./RecipeContent";
import RecipeDetailSkeleton from "./RecipeDetailSkeleton";
import RecipeTitleBlock from "./RecipeTitleBlock";

export default function RecipeDetailScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  // A deep link has only the id; the list passes the rest so the screen opens with them.
  const params = useLocalSearchParams<{ id: string; title?: string; owner?: string; from?: string }>();
  // Reopening always asks again, so a failure still in the cache can't stand in for the answer.
  const { currentData: recipe, error, isError, refetch } = useGetRecipeQuery(params.id, {
    refetchOnMountOrArgChange: true,
  });
  const { dismissError, isErrorDismissed, refreshControl } = useRefresh(refetch, error);

  const hasFailed = useErrorSinceOpening(error, isError);
  const isGone = hasFailed && isNotFoundError(error);
  const isLoadFailed = hasFailed && !isGone && !recipe;
  useAnnouncement(isGone ? "Recipe not found" : isLoadFailed ? "Can't load this recipe" : undefined);

  function leave(): void {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  function renderBody() {
    if (recipe) return <RecipeContent recipe={recipe} />;
    if (hasFailed) {
      return (
        <EmptyState
          action={{ label: "Try again", onPress: () => void refetch() }}
          body="Check your connection and try again."
          heading="Can't load this recipe"
        />
      );
    }
    return <RecipeDetailSkeleton />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Recipe", headerBackTitle: recipeBackTitle(params.from) }} />
      {isGone ? (
        <EmptyState
          action={{ label: "Back to recipes", onPress: leave }}
          body="It may have been deleted, or the link may be wrong."
          heading="Recipe not found"
        />
      ) : (
        <>
          {hasFailed && recipe && !isErrorDismissed ? (
            <Toast
              message="Couldn't update this recipe. Check your connection and try again."
              onDismiss={dismissError}
              style={{ margin: spacing.lg, marginBottom: 0 }}
              variant="error"
            />
          ) : null}
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
            refreshControl={refreshControl}
            testID="recipe-detail"
          >
            <RecipeTitleBlock
              isLoading={!hasFailed}
              owner={recipe?.owner_display_name ?? params.owner}
              title={recipe?.title ?? params.title}
            />
            {renderBody()}
          </ScrollView>
        </>
      )}
    </View>
  );
}
