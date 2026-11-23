import { useEffect, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, ChefHat, Compass, Plus, Search } from "lucide-react";
import { EmptyState, LoadMoreFooter, StaleDataBanner, cn, useIsAuthenticated } from "@platform/ui";
import { useRecipesPages } from "@myrecipes/api-client/hooks/useRecipesPages";
import { RECIPES_LIST_ERROR_COPY } from "@myrecipes/api-client/constants/recipesListCopy";
import { recipesListErrorMessage } from "@myrecipes/api-client/utils/recipesListErrorMessage";
import RecipeCard from "@/features/recipes/RecipeCard";
import RecipesListSkeleton from "@/features/recipes/RecipesListSkeleton";
import { useUrlSyncedSearch } from "@/features/recipes/useUrlSyncedSearch";
import { RECIPES_EMPTY_STATE, RECIPES_SEARCH_EMPTY } from "@/constants/empty-states";
import { STALE_DATA_MESSAGES } from "@/constants/stale-data-messages";
import { RECIPES_LIST_MESSAGES } from "@/constants/recipes-list-messages";
import { RECIPE_SEARCH_DEBOUNCE_MS } from "@/constants/recipe-search";
import type { RecipeSummary } from "@myrecipes/api-client/types/recipe/recipe";

export default function Recipes() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the source of truth: ?q= drives the free-text search and
  // ?owner=me narrows to the signed-in user's own recipes.
  const query = searchParams.get("q") ?? "";
  // "My recipes" only means something when signed in; the server answers 401
  // to it otherwise, so a signed-out visitor gets the public list instead.
  const ownerMe = isAuthenticated && searchParams.get("owner") === "me";

  function writeQuery(next: string) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set("q", next);
        else params.delete("q");
        return params;
      },
      { replace: true },
    );
  }

  // Local input keeps typing responsive; the debounced value is what gets
  // written back to ?q= so each keystroke neither stacks a history entry nor
  // fires a request. Back and Forward put the URL's search back in the box.
  const { input, setInput } = useUrlSyncedSearch(query, writeQuery, RECIPE_SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (isAuthenticated) return;
    setSearchParams(
      (prev) => {
        if (!prev.has("owner")) return prev;
        const next = new URLSearchParams(prev);
        next.delete("owner");
        return next;
      },
      { replace: true },
    );
  }, [isAuthenticated, setSearchParams]);

  const list = useRecipesPages({
    search: query || undefined,
    owner: ownerMe ? "me" : undefined,
  });

  function goToNew() {
    navigate("/recipes/new");
  }

  function goToImport() {
    navigate("/recipes/import");
  }

  function goToDiscover() {
    navigate("/discover");
  }

  function toggleOwnerMe() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("owner") === "me") next.delete("owner");
        else next.set("owner", "me");
        return next;
      },
      { replace: true },
    );
  }

  const { recipes } = list;
  const hasSearch = query.length > 0;

  let content: ReactNode;
  if (list.isLoading) {
    content = <RecipesListSkeleton />;
  } else if (list.loadError !== undefined) {
    content = (
      <EmptyState
        icon={<ChefHat className="w-12 h-12 text-destructive" />}
        heading={RECIPES_LIST_ERROR_COPY.heading}
        body={recipesListErrorMessage(list.loadError)}
        action={{ label: STALE_DATA_MESSAGES.tryAgain, onClick: () => void list.refetch(), loading: list.isFetching }}
      />
    );
  } else if (recipes.length === 0 && hasSearch) {
    content = (
      <EmptyState
        icon={<Search className="w-12 h-12" />}
        heading={RECIPES_SEARCH_EMPTY.heading}
        body={RECIPES_SEARCH_EMPTY.body}
      />
    );
  } else if (recipes.length === 0) {
    content = (
      <EmptyState
        icon={<ChefHat className="w-12 h-12" />}
        heading={RECIPES_EMPTY_STATE.heading}
        body={RECIPES_EMPTY_STATE.body}
        action={{ label: RECIPES_EMPTY_STATE.actionLabel, onClick: goToNew }}
      />
    );
  } else {
    // A failed refresh (not a failed next page, which the footer reports) leaves the rows up.
    const isStale = list.error !== undefined && !list.isLoadMoreError;
    content = (
      <div className="space-y-4">
        {isStale ? (
          <StaleDataBanner
            message={STALE_DATA_MESSAGES.recipes}
            onRetry={() => void list.refetch()}
            retryLabel={STALE_DATA_MESSAGES.tryAgain}
          />
        ) : null}
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy={list.isFiltering}
        >
          {recipes.map((recipe: RecipeSummary) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
        {list.isFiltering ? null : (
          <LoadMoreFooter
            shown={recipes.length}
            total={list.total}
            hasNextPage={list.hasNextPage}
            isLoading={list.isFetchingNextPage}
            isError={list.isLoadMoreError}
            onLoadMore={list.loadMore}
            messages={RECIPES_LIST_MESSAGES}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={goToDiscover}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted min-h-[44px]"
          >
            <Compass className="w-4 h-4" />
            Discover
          </button>
          <button
            onClick={goToImport}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted min-h-[44px]"
          >
            <Camera className="w-4 h-4" />
            Import from photo
          </button>
          <button
            onClick={goToNew}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            New recipe
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search recipes by title"
            aria-label="Search recipes by title"
            className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
          />
        </div>
        {isAuthenticated ? (
          <button
            type="button"
            onClick={toggleOwnerMe}
            aria-pressed={ownerMe}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors min-h-[44px]",
              ownerMe
                ? "border-primary bg-primary/10 text-primary"
                : "bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <ChefHat className="w-4 h-4" />
            My recipes
          </button>
        ) : null}
      </div>

      {content}
    </div>
  );
}
