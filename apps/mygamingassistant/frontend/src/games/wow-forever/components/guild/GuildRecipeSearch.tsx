import { useEffect, useId, useState } from "react";
import GuildRecipeResults from "@/games/wow-forever/components/guild/GuildRecipeResults";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import { RECIPE_QUERY_MAX_LENGTH, RECIPE_QUERY_MIN_LENGTH, RECIPE_SEARCH_DEBOUNCE_MS } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { useRecipeSearchParam } from "@/games/wow-forever/hooks/useRecipeSearchParam";
import { searchableQuery } from "@/games/wow-forever/lib/guild/guildRecipes";

/** "Who can craft this?": search the recipes the guild's members know by name. */
export default function GuildRecipeSearch({ slug }: { slug: string }) {
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const { recipe, setRecipe } = useRecipeSearchParam();
  const [text, setText] = useState(recipe);
  const [urlRecipe, setUrlRecipe] = useState(recipe);

  // The URL can change underneath (a link, Back): follow it — but not our own
  // trimmed write, or "linen " would lose its space mid-typing.
  if (recipe !== urlRecipe) {
    setUrlRecipe(recipe);
    if (recipe !== text.trim()) setText(recipe);
  }

  useEffect(() => {
    if (text.trim() === recipe) return undefined;
    const timer = window.setTimeout(() => setRecipe(text.trim()), RECIPE_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text, recipe, setRecipe]);

  const query = searchableQuery(recipe);
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card/50 p-3 sm:p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Who can craft this?
      </h2>
      <div className="space-y-1" role="search" aria-label="Search the guild's recipes">
        <label htmlFor={inputId} className="text-sm font-medium">
          Recipe
        </label>
        <input
          id={inputId}
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Linen, Healing Potion"
          maxLength={RECIPE_QUERY_MAX_LENGTH}
          autoComplete="off"
          aria-describedby={hintId}
          className={`${GUILD_CONTROL} sm:max-w-md`}
        />
        <p id={hintId} className="text-xs text-muted-foreground">
          Type at least {RECIPE_QUERY_MIN_LENGTH} letters. Gathering and fishing aren&apos;t searched.
        </p>
      </div>
      {query ? <GuildRecipeResults slug={slug} query={query} /> : null}
    </section>
  );
}
