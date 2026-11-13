import { useId } from "react";
import GuildRecipeResults from "@/games/wow-forever/components/guild/GuildRecipeResults";
import { GUILD_CONTROL } from "@/games/wow-forever/data/guild/guildStyles";
import {
  RECIPE_QUERY_MAX_LENGTH,
  RECIPE_QUERY_MIN_LENGTH,
  RECIPE_SEARCH_DEBOUNCE_MS,
  RECIPE_SEARCH_PARAM,
} from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { useDebouncedSearchParam } from "@/games/wow-forever/hooks/useDebouncedSearchParam";
import { searchableQuery } from "@/games/wow-forever/lib/guild/guildRecipes";

/** "Who can craft this?": search the recipes the guild's members know by name. */
export default function GuildRecipeSearch({ slug }: { slug: string }) {
  const headingId = useId();
  const inputId = useId();
  const hintId = useId();
  const { text, setText, value: recipe } = useDebouncedSearchParam(RECIPE_SEARCH_PARAM, RECIPE_SEARCH_DEBOUNCE_MS);

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
