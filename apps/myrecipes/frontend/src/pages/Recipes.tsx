import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChefHat, Plus, Search } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { useListRecipesQuery } from "@/store/recipesApi";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import RecipeCard from "@/features/recipes/RecipeCard";
import RecipesListSkeleton from "@/features/recipes/RecipesListSkeleton";
import { RECIPES_EMPTY_STATE, RECIPES_SEARCH_EMPTY } from "@/constants/empty-states";

export default function Recipes() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const { data, isLoading, isError, error, isFetching } = useListRecipesQuery(
    debouncedSearch || undefined,
  );

  function goToNew() {
    navigate("/recipes/new");
  }

  const recipes = data ?? [];
  const hasSearch = debouncedSearch.length > 0;

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <button
          onClick={goToNew}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          New recipe
        </button>
      </header>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes by title"
          aria-label="Search recipes by title"
          className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
        />
      </div>

      {isLoading ? (
        <RecipesListSkeleton />
      ) : isError ? (
        <EmptyState
          icon={<ChefHat className="w-12 h-12 text-destructive" />}
          heading="Couldn't load recipes"
          body={
            error && typeof error === "object" && "status" in error
              ? `The server returned ${(error as { status?: number }).status}. Try refreshing.`
              : "Try refreshing the page."
          }
        />
      ) : recipes.length === 0 ? (
        hasSearch ? (
          <EmptyState
            icon={<Search className="w-12 h-12" />}
            heading={RECIPES_SEARCH_EMPTY.heading}
            body={RECIPES_SEARCH_EMPTY.body}
          />
        ) : (
          <EmptyState
            icon={<ChefHat className="w-12 h-12" />}
            heading={RECIPES_EMPTY_STATE.heading}
            body={RECIPES_EMPTY_STATE.body}
            action={{ label: RECIPES_EMPTY_STATE.actionLabel, onClick: goToNew }}
          />
        )
      ) : (
        <div
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy={isFetching}
        >
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </main>
  );
}
