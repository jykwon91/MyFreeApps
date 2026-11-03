import { useGetRecipeQuery } from "@myrecipes/api-client/store/recipesApi";
import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";
import { EmptyState, Skeleton, useAnnouncement, useTheme } from "@platform/mobile";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useErrorSinceOpening } from "../../hooks/useErrorSinceOpening";
import { hasCookSteps } from "../../utils/hasCookSteps";
import { isNotFoundError } from "../../utils/isNotFoundError";
import CookBarButton from "./CookBarButton";
import CookSessionView from "./CookSessionView";

export default function CookScreen() {
  const { colors, spacing, fontSize } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  // No refetch on opening: a recipe that's already loaded keeps working without a connection.
  const { currentData: recipe, error, isError, refetch } = useGetRecipeQuery(id);
  const hasFailed = useErrorSinceOpening(error, isError);
  const version = recipe?.latest_version;

  // Frozen on opening: a refetch mustn't change or remove the steps under someone mid-recipe.
  const [frozen, setFrozen] = useState<{ recipeId: string; title: string; version: VersionResponse } | null>(null);
  if (recipe && version && hasCookSteps(version) && frozen?.recipeId !== id) {
    setFrozen({ recipeId: id, title: recipe.title, version });
  }
  const opened = frozen?.recipeId === id ? frozen : null;

  const isGone = !opened && !recipe && hasFailed && isNotFoundError(error);
  const isLoadFailed = !opened && !recipe && hasFailed && !isGone;
  useAnnouncement(isGone ? "Recipe not found" : isLoadFailed ? "Can't load this recipe" : undefined);

  function exit(): void {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: "/recipes/[id]", params: { id } });
  }

  function renderUnavailable() {
    if (isGone) {
      return <EmptyState body="It may have been deleted, or the link may be wrong." heading="Recipe not found" />;
    }
    if (isLoadFailed) {
      return (
        <EmptyState
          action={{ label: "Try again", onPress: () => void refetch() }}
          body="Check your connection and try again."
          heading="Can't load this recipe"
        />
      );
    }
    if (recipe) {
      return <EmptyState body="This recipe doesn't have any steps yet." heading="Nothing to cook yet" />;
    }
    return (
      <View accessibilityLabel="Loading recipe" accessible style={{ padding: spacing.lg, gap: spacing.md }}>
        <Skeleton height={fontSize.xl} />
        <Skeleton height={fontSize.xl} width="85%" />
        <Skeleton height={fontSize.xl} width="60%" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
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
