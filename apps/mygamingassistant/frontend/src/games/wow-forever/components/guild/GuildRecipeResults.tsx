import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import CharacterRowSkeletons from "@/games/wow-forever/components/character/CharacterRowSkeletons";
import GuildRecipeCard from "@/games/wow-forever/components/guild/GuildRecipeCard";
import { useSearchGuildRecipesQuery } from "@/games/wow-forever/api/wowGuildApi";
import { RECIPE_SEARCH_PROBLEM, RECIPE_SKELETON_ROWS } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { recipeSearchStatus } from "@/games/wow-forever/lib/guild/guildRecipes";

interface GuildRecipeResultsProps {
  slug: string;
  /** Already trimmed and long enough to search. */
  query: string;
}

/** The guild's known recipes matching the search, each with who knows it. */
export default function GuildRecipeResults({ slug, query }: GuildRecipeResultsProps) {
  const { currentData, isFetching, isError, refetch } = useSearchGuildRecipesQuery({ slug, query });

  if (isFetching && !currentData) {
    return (
      <div aria-hidden data-testid="guild-recipe-skeleton">
        <CharacterRowSkeletons count={RECIPE_SKELETON_ROWS} height="h-[76px]" />
      </div>
    );
  }
  if (isError || !currentData) return <LoadErrorRetry message={RECIPE_SEARCH_PROBLEM} onRetry={refetch} retrying={isFetching} />;
  if (currentData.recipes.length === 0) {
    return (
      <p role="status" className="rounded-lg border border-dashed p-4 text-sm">
        Nobody in the guild knows a recipe matching &quot;{currentData.query}&quot; that we know of. We only see the
        recipes of members whose characters have been looked up.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p role="status" className="text-sm text-muted-foreground">
        {recipeSearchStatus(currentData)}
      </p>
      <ul className="space-y-2" aria-label="Matching recipes">
        {currentData.recipes.map((recipe) => (
          <GuildRecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </ul>
    </div>
  );
}
