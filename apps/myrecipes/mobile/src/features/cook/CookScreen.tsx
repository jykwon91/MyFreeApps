import { RECIPE_LOAD_FAILED_COPY } from "@myrecipes/api-client/constants/recipeLoadFailedCopy";
import { RECIPE_NOT_FOUND_COPY } from "@myrecipes/api-client/constants/recipeNotFoundCopy";
import { useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import { Banner, EmptyState, LoadingRegion, Skeleton, useAnnouncement, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useErrorSinceOpening } from "@myrecipes/api-client/hooks/useErrorSinceOpening";
import { COOK_COPY_MESSAGES } from "../../constants/cook";
import type { OpenedCookRecipe } from "../../types/OpenedCookRecipe";
import { hasCookSteps } from "../../utils/hasCookSteps";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import { isNotFoundError } from "@myrecipes/api-client/utils/isNotFoundError";
import type { AppStore } from "../../lib/store";
import { forgetRecipe } from "../forgetRecipe/forgetRecipe";
import CookBarButton from "./CookBarButton";
import CookSessionView from "./CookSessionView";
import { loadCookCopy, saveCookCopy } from "./cookCopies";

export default function CookScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const router = useRouter();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const { id } = useLocalSearchParams<{ id: string }>();
  // No refetch on opening, so a recipe still in the cache opens without a connection. That cache is
  // in memory and short-lived, so a cold start or a link opens the copy saved on the last cook instead.
  const { currentData: recipe, error, isError, refetch } = useGetRecipeQuery(id);
  const hasFailed = useErrorSinceOpening(error, isError);
  const version = recipe?.latest_version;
  const cookable = version && hasCookSteps(version) ? version : null;
  const isOffline = !recipe && hasFailed && isNoResponse(error);
  const savedCopy = useMemo(() => (isOffline ? loadCookCopy(id) : null), [id, isOffline]);

  // Frozen on opening: a refetch mustn't change or remove the steps under someone mid-recipe.
  const [frozen, setFrozen] = useState<OpenedCookRecipe | null>(null);
  if (frozen?.recipeId !== id) {
    if (recipe && cookable) setFrozen({ recipeId: id, title: recipe.title, version: cookable, isSavedCopy: false });
    else if (savedCopy) setFrozen({ recipeId: id, title: savedCopy.title, version: savedCopy.version, isSavedCopy: true });
  }
  const opened = frozen?.recipeId === id ? frozen : null;

  const isGone = !opened && !recipe && hasFailed && isNotFoundError(error);
  const isLoadFailed = !opened && !recipe && hasFailed && !isGone;

  useEffect(() => {
    if (recipe && cookable) saveCookCopy(id, recipe.title, cookable);
  }, [cookable, id, recipe]);

  useEffect(() => {
    if (isGone) dispatch(forgetRecipe(id));
  }, [dispatch, id, isGone]);

  useAnnouncement(isGone ? RECIPE_NOT_FOUND_COPY.heading : isLoadFailed ? RECIPE_LOAD_FAILED_COPY.heading : undefined);

  function exit(): void {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/recipes/[id]", params: { id } });
  }

  function renderUnavailable() {
    if (isGone) {
      return <EmptyState body={RECIPE_NOT_FOUND_COPY.body} heading={RECIPE_NOT_FOUND_COPY.heading} />;
    }
    if (isLoadFailed) {
      return (
        <EmptyState
          action={{ label: "Try again", onPress: () => refetch() }}
          body={RECIPE_LOAD_FAILED_COPY.body}
          heading={RECIPE_LOAD_FAILED_COPY.heading}
        />
      );
    }
    if (recipe) {
      return <EmptyState body="This recipe doesn't have any steps yet." heading="Nothing to cook yet" />;
    }
    return (
      <LoadingRegion label="Loading recipe" style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={fontSize.xl} />
        <Skeleton height={fontSize.xl} width="85%" />
        <Skeleton height={fontSize.xl} width="60%" />
      </LoadingRegion>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      {opened?.isSavedCopy && !recipe ? (
        <Banner message={COOK_COPY_MESSAGES.offlineNotice} style={{ margin: spacing.sm }} tone="info" />
      ) : null}
      {opened ? (
        <CookSessionView
          key={opened.recipeId}
          onExit={exit}
          recipeId={opened.recipeId}
          title={opened.title}
          version={opened.version}
        />
      ) : (
        <>
          <View style={{ flexDirection: "row" }}>
            <CookBarButton accessibilityLabel="Exit cooking" label="✕" onPress={exit} />
          </View>
          {renderUnavailable()}
        </>
      )}
    </SafeAreaView>
  );
}
