import { useDeleteRecipeMutation, useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { EmptyState, LoadingButton, Toast, useAnnouncement, useRefresh, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useDispatch } from "react-redux";
import { useErrorSinceOpening } from "@myrecipes/api-client/hooks/useErrorSinceOpening";
import { COOK_COPY_MESSAGES } from "../../constants/cook";
import { useCachedRecipeSummary } from "../../hooks/useCachedRecipeSummary";
import { useOpenOnce } from "../../hooks/useOpenOnce";
import { cookHref } from "../../utils/cookHref";
import { deleteRecipeCacheKey } from "../../utils/deleteRecipeCacheKey";
import { isNotFoundError } from "@myrecipes/api-client/utils/isNotFoundError";
import { recipeBackTitle } from "../../utils/recipeBackTitle";
import type { AppStore } from "../../lib/store";
import { loadCookCopy } from "../cook/cookCopies";
import { forgetRecipe } from "../forgetRecipe/forgetRecipe";
import RecipeContent from "./RecipeContent";
import RecipeDetailSkeleton from "./RecipeDetailSkeleton";
import RecipeTitleBlock from "./RecipeTitleBlock";

export default function RecipeDetailScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  // Only the id (and where Back goes) come from the route: a link can say anything, so the text shown
  // is the server's, or the row from a list the app already loaded.
  const params = useLocalSearchParams<{ id: string; from?: string }>();
  const cachedSummary = useCachedRecipeSummary(params.id);
  // Reopening always asks again, so a failure still in the cache can't stand in for the answer.
  const { currentData: recipe, error, isError, refetch } = useGetRecipeQuery(params.id, {
    refetchOnMountOrArgChange: true,
  });
  const { dismissError, isErrorDismissed, refreshControl } = useRefresh(refetch, error);

  // Once this screen's delete has gone through (or found the recipe already gone), the screen is on
  // its way out; the refetch the delete triggers then 404s, and that must not show or announce.
  const [, deletion] = useDeleteRecipeMutation({ fixedCacheKey: deleteRecipeCacheKey(params.id) });
  const isLeaving = deletion.isSuccess || (deletion.isError && isNotFoundError(deletion.error));

  const hasFailedSinceOpening = useErrorSinceOpening(error, isError);
  const hasFailed = hasFailedSinceOpening && !isLeaving;
  const isGone = hasFailed && isNotFoundError(error);
  const isLoadFailed = hasFailed && !isGone && !recipe;
  useEffect(() => {
    if (isGone) dispatch(forgetRecipe(params.id));
  }, [dispatch, isGone, params.id]);
  // Offline with a copy saved from the last cook, that copy can still be cooked.
  const isOffline = isLoadFailed && isNoResponse(error);
  const hasSavedCopy = useMemo(() => isOffline && loadCookCopy(params.id) !== null, [isOffline, params.id]);
  const cookSavedCopy = useOpenOnce(() => router.push(cookHref(params.id)));
  useAnnouncement(isGone ? "Recipe not found" : isLoadFailed ? "Can't load this recipe" : undefined);

  function leave(): void {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  function renderBody() {
    if (recipe) return <RecipeContent recipe={recipe} />;
    if (hasFailed) {
      return (
        <View style={{ gap: spacing.sm }}>
          <EmptyState
            action={{ label: "Try again", onPress: () => refetch() }}
            body="Check your connection and try again."
            heading="Can't load this recipe"
          />
          {hasSavedCopy ? (
            <LoadingButton onPress={cookSavedCopy} variant="secondary">
              {COOK_COPY_MESSAGES.cookSavedCopy}
            </LoadingButton>
          ) : null}
        </View>
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
              owner={(recipe ?? cachedSummary)?.owner_display_name}
              title={(recipe ?? cachedSummary)?.title}
            />
            {renderBody()}
          </ScrollView>
        </>
      )}
    </View>
  );
}
