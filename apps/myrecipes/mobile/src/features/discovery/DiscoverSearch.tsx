import {
  DISCOVERY_QUERY_MAX_LENGTH,
  DISCOVERY_QUERY_MIN_LENGTH,
  DISCOVERY_QUERY_PLACEHOLDER,
  DISCOVERY_SEARCH_STAGES,
} from "@myrecipes/api-client/constants/discovery";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import { Banner, EmptyState, ListSeparator, LoadingButton, SearchField, useScreenFocused, useTheme, useToast } from "@platform/mobile";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Keyboard, ScrollView, Text, View } from "react-native";
import { useDispatch, useSelector, useStore } from "react-redux";
import { DISCOVER_ROUTE, DISCOVERY_DETAIL_PATHNAME, DISCOVERY_MESSAGES } from "../../constants/discovery";
import type { AppStore, RootState } from "../../lib/store";
import { countLabel } from "../../utils/countLabel";
import DiscoverIdle from "./DiscoverIdle";
import DiscoveryCard from "./DiscoveryCard";
import DiscoveryResultsSkeleton from "./DiscoveryResultsSkeleton";
import DiscoveryStatus from "./DiscoveryStatus";
import { searchDiscoveredRecipes } from "./searchDiscoveredRecipes";

/**
 * Search the web for versions of a dish (the website's /discover).
 *
 * A search is a paid call that takes tens of seconds, so it only ever runs from an explicit
 * submit. It runs in the store, so switching tabs mid-search loses nothing; if it lands while
 * another tab is showing, a toast says so. Only the latest search's answer is shown, and none
 * from an account that has since signed out.
 */
export default function DiscoverSearch() {
  const { colors, spacing, fontSize } = useTheme();
  const router = useRouter();
  const dispatch = useDispatch<AppStore["dispatch"]>();
  const store = useStore<RootState>();
  const { showToast } = useToast();
  const results = useSelector((state: RootState) => state.discovery.results);
  const search = useSelector((state: RootState) => state.discovery.search);
  const [input, setInput] = useState(search?.status === "searching" ? search.query : (results?.query ?? ""));
  const isSearching = search?.status === "searching";

  const isFocused = useScreenFocused();
  const isFocusedRef = useRef(isFocused);
  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  const canSearch = input.trim().length >= DISCOVERY_QUERY_MIN_LENGTH;

  async function runSearch(rawQuery: string): Promise<void> {
    const query = rawQuery.trim();
    if (query.length < DISCOVERY_QUERY_MIN_LENGTH || isSearching) return;
    Keyboard.dismiss();
    setInput(query);
    const action = await dispatch(searchDiscoveredRecipes(query));
    // A newer search, or another account, has taken over: this answer was dropped.
    if (store.getState().discovery.search?.requestId !== action.meta.requestId || isFocusedRef.current) return;
    if (searchDiscoveredRecipes.fulfilled.match(action)) {
      showToast(`Found ${countLabel(action.payload.recipes.length, "version")} of ${action.payload.query}.`, "success", {
        label: "Show",
        onPress: () => router.navigate(DISCOVER_ROUTE),
      });
    } else {
      showToast(DISCOVERY_MESSAGES.searchFailedElsewhere, "error");
    }
  }

  function openResult(recipe: DiscoveredRecipe): void {
    router.push({ pathname: DISCOVERY_DETAIL_PATHNAME, params: { id: recipe.id } });
  }

  function renderBody() {
    if (search?.status === "searching") {
      return (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md }}>
          <DiscoveryStatus stages={DISCOVERY_SEARCH_STAGES} startedAt={search.startedAt} />
          <DiscoveryResultsSkeleton />
        </ScrollView>
      );
    }
    if (!results) {
      return (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm }} keyboardShouldPersistTaps="handled">
          <DiscoverIdle onSuggestion={(suggestion) => void runSearch(suggestion)} />
        </ScrollView>
      );
    }
    return (
      <FlatList
        ItemSeparatorComponent={ListSeparator}
        ListEmptyComponent={
          <EmptyState body="Try another dish name, or a shorter one." heading={`Nothing found for ${results.query}`} />
        }
        ListHeaderComponent={
          results.recipes.length > 0 ? (
            <Text style={{ marginBottom: spacing.md, color: colors.mutedForeground, fontSize: fontSize.sm }}>
              {countLabel(results.recipes.length, "version")} of{" "}
              <Text style={{ color: colors.foreground }}>{results.query}</Text>, best first.
            </Text>
          ) : undefined
        }
        contentContainerStyle={{ flexGrow: 1, padding: spacing.lg, paddingTop: spacing.sm }}
        data={results.recipes}
        keyExtractor={(recipe) => recipe.id}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <DiscoveryCard onPress={() => openResult(item)} recipe={item} />}
        testID="discovery-results"
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <SearchField
          accessibilityLabel="Dish to search the web for"
          editable={!isSearching}
          maxLength={DISCOVERY_QUERY_MAX_LENGTH}
          onChangeText={setInput}
          onClear={() => setInput("")}
          onSubmit={() => void runSearch(input)}
          placeholder={DISCOVERY_QUERY_PLACEHOLDER}
          value={input}
        />
        <LoadingButton
          disabled={!canSearch}
          isLoading={isSearching}
          loadingText="Searching..."
          onPress={() => runSearch(input)}
        >
          Search the web
        </LoadingButton>
        {search?.status === "failed" ? <Banner message={search.message} /> : null}
      </View>
      {renderBody()}
    </View>
  );
}
