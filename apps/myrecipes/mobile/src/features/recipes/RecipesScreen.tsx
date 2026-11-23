import { RECIPES_EMPTY_COPY } from "@myrecipes/api-client/constants/recipesEmptyCopy";
import { RECIPES_LIST_ERROR_COPY, RECIPES_MINE_EMPTY_COPY } from "@myrecipes/api-client/constants/recipesListCopy";
import { RECIPES_LOAD_MORE_MESSAGES } from "@myrecipes/api-client/constants/recipesLoadMoreCopy";
import { RECIPES_MINE_FILTER_LABEL } from "@myrecipes/api-client/constants/recipesMineFilterCopy";
import { RECIPES_SEARCH_EMPTY_COPY } from "@myrecipes/api-client/constants/recipesSearchEmptyCopy";
import { useRecipesPages } from "@myrecipes/api-client/hooks/useRecipesPages";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";
import { recipesListErrorMessage } from "@myrecipes/api-client/utils/recipesListErrorMessage";
import { useDebouncedValue } from "@platform/core/hooks/useDebouncedValue";
import { isNoResponse } from "@platform/core/utils/isNoResponse";
import {
  ChipButton,
  EmptyState,
  ListSeparator,
  LoadMoreFooter,
  SearchField,
  Toast,
  useAnnouncement,
  useRefresh,
  useSession,
  useTheme,
} from "@platform/mobile";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { NEW_RECIPE_MESSAGES } from "../../constants/newRecipe";
import { cookHref } from "../../utils/cookHref";
import { formatCount } from "@platform/core/utils/count";
import { listCookCopies } from "../cook/cookCopies";
import SavedCookCopies from "../cook/SavedCookCopies";
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

  // A new search or filter starts again from the first page.
  const list = useRecipesPages({ search: term || undefined, owner: ownerMe ? "me" : undefined });

  const { dismissError, isErrorDismissed, isRefreshing, refresh, refreshControl } = useRefresh(list.refetch, list.error);

  // While a new search loads, the previous rows stay on screen, dimmed. If it fails they
  // are another search's rows, so none are shown.
  const rows = list.loadError === undefined ? list.recipes : [];
  const isPending = list.isLoading || list.isFiltering;
  const hasListError = list.error !== undefined && !list.isLoadMoreError;
  const hasFailedOverRows = hasListError && rows.length > 0 && !isErrorDismissed;
  // Offline with nothing to show, the recipes saved from recent cooks can still be cooked.
  const isOffline = hasListError && !rows.length && isNoResponse(list.error);
  const savedCopies = useMemo(() => (isOffline ? listCookCopies() : []), [isOffline]);
  const isSearchSettled = term === trimmed && !isPending && !hasListError;
  useAnnouncement(
    hasListError && !rows.length
      ? RECIPES_LIST_ERROR_COPY.heading
      : (term || ownerMe) && list.hasData && isSearchSettled
        ? formatCount(list.total, "recipe")
        : undefined,
  );

  function changeSearch(text: string): void {
    setSearch(({ clears }) => ({ text, clears: text.trim() ? clears : clears + 1 }));
  }

  function clearSearch(): void {
    changeSearch("");
  }

  function renderEmpty() {
    if (isPending || isRefreshing) return <RecipeListSkeleton />;
    if (hasListError) {
      return (
        <View style={{ gap: spacing.lg }}>
          <EmptyState
            action={{ label: "Try again", onPress: () => refresh() }}
            body={recipesListErrorMessage(list.error)}
            heading={RECIPES_LIST_ERROR_COPY.heading}
          />
          {savedCopies.length ? (
            <SavedCookCopies copies={savedCopies} onOpen={(recipeId) => router.push(cookHref(recipeId))} />
          ) : null}
        </View>
      );
    }
    if (term) {
      return (
        <EmptyState
          action={{ label: "Clear search", onPress: clearSearch }}
          body={RECIPES_SEARCH_EMPTY_COPY.body(term)}
          heading={RECIPES_SEARCH_EMPTY_COPY.heading}
        />
      );
    }
    if (ownerMe) {
      return (
        <EmptyState
          action={{ label: RECIPES_MINE_EMPTY_COPY.actionLabel, onPress: () => setIsMineOnly(false) }}
          body={RECIPES_MINE_EMPTY_COPY.body}
          heading={RECIPES_MINE_EMPTY_COPY.heading}
        />
      );
    }
    return (
      <EmptyState
        action={{ label: NEW_RECIPE_MESSAGES.newRecipe, onPress: () => router.push("/recipes/new") }}
        body={RECIPES_EMPTY_COPY.body}
        heading={RECIPES_EMPTY_COPY.heading}
      />
    );
  }

  function openRecipe(recipe: RecipeSummary): void {
    router.push({ pathname: "/recipes/[id]", params: { id: recipe.id } });
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
              label={RECIPES_MINE_FILTER_LABEL}
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
        ListFooterComponent={
          !list.isFiltering && list.loadError === undefined && list.hasNextPage ? (
            <LoadMoreFooter
              isError={list.isLoadMoreError}
              isLoading={list.isFetchingNextPage}
              messages={RECIPES_LOAD_MORE_MESSAGES}
              onLoadMore={list.loadMore}
              shown={rows.length}
              total={list.total}
            />
          ) : undefined
        }
        ListFooterComponentStyle={{ paddingTop: spacing.lg }}
        data={rows}
        keyExtractor={(recipe) => recipe.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        renderItem={({ item }) => <RecipeCard onPress={() => openRecipe(item)} recipe={item} />}
        testID="recipe-list"
        style={{ opacity: list.isFiltering && !isRefreshing && rows.length ? 0.6 : 1 }}
      />
    </View>
  );
}
