import { useListRecipesQuery } from "@myrecipes/api-client/store/recipesApi";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { useDebouncedValue } from "@platform/core/hooks/useDebouncedValue";
import {
  ChipButton,
  EmptyState,
  ListSeparator,
  SearchField,
  Toast,
  useAnnouncement,
  useRefresh,
  useSession,
  useTheme,
} from "@platform/mobile";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { NEW_RECIPE_MESSAGES } from "../../constants/newRecipe";
import { RECIPES_MESSAGES } from "../../constants/recipes";
import { countLabel } from "../../utils/countLabel";
import RecipeCard from "./RecipeCard";
import RecipeListSkeleton from "./RecipeListSkeleton";

export default function RecipesScreen() {
  const { colors, spacing } = useTheme();
  const router = useRouter();
  // `clears` counts each time the field empties, so a term still waiting on the debounce
  // can be told apart from what's in the field now and can't come back after clearing.
  const [search, setSearch] = useState({ text: "", clears: 0 });
  // Kept apart from the search so typing or clearing it never turns the filter off.
  const [isMineOnly, setIsMineOnly] = useState(false);
  const { state } = useSession();
  // As on the website, the filter is for people who are signed in.
  const canFilterMine = state.status === "signedIn";
  const ownerMe = canFilterMine && isMineOnly;
  // Signing out turns it off for good, so the next account to sign in starts unfiltered.
  if (!canFilterMine && isMineOnly) setIsMineOnly(false);

  const trimmed = search.text.trim();
  const debounced = useDebouncedValue(search);
  // Clearing the field shows the full list right away; only typing waits.
  const term = trimmed && debounced.clears === search.clears ? debounced.text.trim() : "";

  const { currentData, data, error, isError, isFetching, refetch } = useListRecipesQuery(
    term || ownerMe ? { search: term || undefined, owner: ownerMe ? "me" : undefined } : undefined,
  );

  const { dismissError, isErrorDismissed, isRefreshing, refreshControl } = useRefresh(refetch, error);

  // While loading, `data` keeps the previous rows on screen, dimmed. After a failure it
  // could be another search's rows, so only this search's own are shown.
  const rows = isError ? currentData : data;
  const hasFailedOverRows = isError && !!currentData?.length && !isErrorDismissed;
  const isSearchSettled = term === trimmed && !isFetching && !isError;
  useAnnouncement(
    isError && !rows?.length
      ? "Can't load recipes"
      : (term || ownerMe) && rows && isSearchSettled
        ? countLabel(rows.length, "recipe")
        : undefined,
  );

  function changeSearch(text: string): void {
    setSearch(({ clears }) => ({ text, clears: text.trim() ? clears : clears + 1 }));
  }

  function clearSearch(): void {
    changeSearch("");
  }

  function renderEmpty() {
    if (isFetching) return <RecipeListSkeleton />;
    if (isError) {
      return (
        <EmptyState
          action={{ label: "Try again", onPress: () => void refetch() }}
          body="Check your connection and try again."
          heading="Can't load recipes"
        />
      );
    }
    if (term) {
      return (
        <EmptyState
          action={{ label: "Clear search", onPress: clearSearch }}
          body={`Nothing matches "${term}". Check the spelling or try a shorter word.`}
          heading="No matches"
        />
      );
    }
    if (ownerMe) {
      return (
        <EmptyState
          action={{ label: RECIPES_MESSAGES.showAll, onPress: () => setIsMineOnly(false) }}
          body={RECIPES_MESSAGES.mineEmptyBody}
          heading={RECIPES_MESSAGES.mineEmptyHeading}
        />
      );
    }
    return (
      <EmptyState
        action={{ label: NEW_RECIPE_MESSAGES.newRecipe, onPress: () => router.push("/recipes/new") }}
        body="Recipes shared on MyRecipes will show up here."
        heading="No recipes yet"
      />
    );
  }

  function openRecipe(recipe: RecipeSummary): void {
    router.push({
      pathname: "/recipes/[id]",
      params: { id: recipe.id, title: recipe.title, owner: recipe.owner_display_name },
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <SearchField
          accessibilityLabel="Search recipes by title"
          onChangeText={changeSearch}
          onClear={clearSearch}
          placeholder="Search recipes"
          value={search.text}
        />
        {canFilterMine ? (
          <View style={{ flexDirection: "row" }}>
            <ChipButton
              isChecked={isMineOnly}
              label={RECIPES_MESSAGES.myRecipes}
              onPress={() => setIsMineOnly((on) => !on)}
            />
          </View>
        ) : null}
      </View>
      {hasFailedOverRows ? (
        <Toast
          message="Couldn't update the list. Check your connection and try again."
          onDismiss={dismissError}
          style={{ marginHorizontal: spacing.lg, marginBottom: spacing.sm }}
          variant="error"
        />
      ) : null}
      <FlatList
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={renderEmpty()}
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm }}
        data={rows ?? []}
        keyExtractor={(recipe) => recipe.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        renderItem={({ item }) => <RecipeCard onPress={() => openRecipe(item)} recipe={item} />}
        testID="recipe-list"
        style={{ opacity: isFetching && !isRefreshing && rows?.length ? 0.6 : 1 }}
      />
    </View>
  );
}
