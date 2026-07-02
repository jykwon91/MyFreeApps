import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, ChefHat, Plus, Search } from "lucide-react";
import { EmptyState, cn, useIsAuthenticated } from "@platform/ui";
import { useListRecipesQuery } from "@/store/recipesApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import RecipeCard from "@/features/recipes/RecipeCard";
import RecipesListSkeleton from "@/features/recipes/RecipesListSkeleton";
import { RECIPES_EMPTY_STATE, RECIPES_SEARCH_EMPTY } from "@/constants/empty-states";
import type { RecipeSummary } from "@/types/recipe/recipe";

function errorBody(error: unknown): string {
  if (error && typeof error === "object" && "status" in error) {
    return `The server returned ${(error as { status?: number }).status}. Try refreshing.`;
  }
  return "Try refreshing the page.";
}

export default function Recipes() {
  const navigate = useNavigate();
  const isAuthenticated = useIsAuthenticated();
  const [searchParams, setSearchParams] = useSearchParams();

  // The URL is the source of truth: ?q= drives the free-text search and
  // ?owner=me narrows to the signed-in user's own recipes.
  const query = searchParams.get("q") ?? "";
  const ownerMe = searchParams.get("owner") === "me";

  // Local input keeps typing responsive; the debounced value is what gets
  // written back to ?q= so each keystroke neither stacks a history entry nor
  // fires a request.
  const [input, setInput] = useState(query);
  const debouncedInput = useDebouncedValue(input.trim(), 300);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (debouncedInput) next.set("q", debouncedInput);
        else next.delete("q");
        return next;
      },
      { replace: true },
    );
  }, [debouncedInput, setSearchParams]);

  const { data, isLoading, isError, error, isFetching } = useListRecipesQuery({
    search: query || undefined,
    owner: ownerMe ? "me" : undefined,
  });

  function goToNew() {
    navigate("/recipes/new");
  }

  function goToImport() {
    navigate("/recipes/import");
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

  const recipes = data ?? [];
  const hasSearch = query.length > 0;

  let content: ReactNode;
  if (isLoading) {
    content = <RecipesListSkeleton />;
  } else if (isError) {
    content = (
      <EmptyState
        icon={<ChefHat className="w-12 h-12 text-destructive" />}
        heading="Couldn't load recipes"
        body={errorBody(error)}
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
    content = (
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy={isFetching}
      >
        {recipes.map((recipe: RecipeSummary) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    );
  }

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={goToImport}
            className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted min-h-[44px]"
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
    </main>
  );
}
