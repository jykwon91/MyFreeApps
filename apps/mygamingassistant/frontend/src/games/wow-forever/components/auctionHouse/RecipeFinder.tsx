import { useId, useMemo, useState } from "react";
import { findRecipes } from "@/games/wow-forever/lib/auctionHouse/professionMaterials";
import type { RecipeOption } from "@/games/wow-forever/types/auctionHouse/recipeOption";

interface RecipeFinderProps {
  options: readonly RecipeOption[];
  professionLabel: string;
  onPick: (spell: number) => void;
}

/** "Recipe": type part of a recipe's name, then pick it to see what its materials cost. */
export default function RecipeFinder({ options, professionLabel, onPick }: RecipeFinderProps) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => findRecipes(options, query), [options, query]);
  const listId = useId();
  const typed = query.trim() !== "";
  return (
    <div className="space-y-2 sm:max-w-md">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Recipe</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${professionLabel} recipes by name`}
          aria-controls={listId}
          className="min-h-[44px] rounded-md border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          data-testid="recipe-finder"
        />
      </label>
      <p className="text-xs text-muted-foreground">Pick a recipe to see what its materials cost and what it sells for.</p>
      <ul id={listId} className="space-y-1" aria-live="polite">
        {matches.map((o) => (
          <li key={o.spell}>
            <button
              type="button"
              onClick={() => onPick(o.spell)}
              className="min-h-[44px] w-full rounded-md border bg-card px-3 text-left text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="recipe-match"
            >
              {o.label}
            </button>
          </li>
        ))}
        {typed && matches.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No {professionLabel} recipe matches &quot;{query.trim()}&quot;.
          </li>
        )}
      </ul>
    </div>
  );
}
