import { useState, type FormEvent, type Ref } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Search } from "lucide-react";
import { AlertBox, LoadingButton } from "@platform/ui";
import {
  DISCOVERY_INTRO,
  DISCOVERY_QUERY_MAX_LENGTH,
  DISCOVERY_QUERY_MIN_LENGTH,
  DISCOVERY_QUERY_PLACEHOLDER,
} from "@myrecipes/api-client/constants/discovery";
import { selectDiscoveryResults, selectDiscoverySearch } from "@myrecipes/api-client/store/discoverySlice";
import { searchDiscoveredRecipes } from "@myrecipes/api-client/store/searchDiscoveredRecipes";
import type { DiscoveredRecipe } from "@myrecipes/api-client/types/recipe/discovery";
import DiscoveryBrowseContent from "@/features/discovery/DiscoveryBrowseContent";
import DiscoveryResultCount from "@/features/discovery/DiscoveryResultCount";
import DiscoverySuggestions from "@/features/discovery/DiscoverySuggestions";
import type { AppDispatch } from "@/lib/store";

interface Props {
  /** The step's heading, focused when Discover moves to it. */
  headingRef: Ref<HTMLHeadingElement>;
  onOpen: (recipe: DiscoveredRecipe) => void;
}

/**
 * Discover's search box and what it found. A search is an explicit submit, never a remount or a
 * cache miss, and it runs in the store: leaving the page mid-search, or after, loses nothing.
 */
export default function DiscoveryBrowse({ headingRef, onOpen }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const search = useSelector(selectDiscoverySearch);
  const results = useSelector(selectDiscoveryResults);
  const isSearching = search?.status === "searching";
  const [input, setInput] = useState(search?.status === "searching" ? search.query : (results?.query ?? ""));
  const showsSuggestions = !isSearching && (!results || results.recipes.length === 0);

  function runSearch(rawQuery: string) {
    const query = rawQuery.trim();
    if (query.length < DISCOVERY_QUERY_MIN_LENGTH || isSearching) return;
    setInput(query);
    void dispatch(searchDiscoveredRecipes(query));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    runSearch(input);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none">
          Discover recipes
        </h1>
        <p className="text-sm text-muted-foreground">{DISCOVERY_INTRO}</p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-md flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={DISCOVERY_QUERY_PLACEHOLDER}
            maxLength={DISCOVERY_QUERY_MAX_LENGTH}
            aria-label="Dish to search the web for"
            disabled={isSearching}
            className="min-h-[44px] w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          />
        </div>
        <LoadingButton
          type="submit"
          isLoading={isSearching}
          loadingText="Searching..."
          disabled={input.trim().length < DISCOVERY_QUERY_MIN_LENGTH}
        >
          Search the web
        </LoadingButton>
      </form>

      {showsSuggestions ? <DiscoverySuggestions onPick={runSearch} /> : null}

      {search?.status === "failed" ? <AlertBox variant="warning" role="alert">{search.message}</AlertBox> : null}

      <div className="space-y-3">
        {/* Always there, so a finished search's count is announced as it arrives. */}
        <div role="status">{results && !isSearching ? <DiscoveryResultCount results={results} /> : null}</div>
        <DiscoveryBrowseContent isSearching={isSearching} results={results} onOpen={onOpen} />
      </div>
    </div>
  );
}
