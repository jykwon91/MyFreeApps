import { useDeferredValue, useId, useMemo, useState } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import RecipeGoalChip from "@/games/wow-forever/components/goalPlanner/RecipeGoalChip";
import RecipeGoalResult from "@/games/wow-forever/components/goalPlanner/RecipeGoalResult";
import { RECIPE_RESULT_LIMIT } from "@/games/wow-forever/data/goalPlanner/goalPlannerConfig";
import { GOAL_PLANNER_TEXT } from "@/games/wow-forever/data/goalPlanner/goalPlannerText";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { searchRecipes } from "@/games/wow-forever/lib/recipes/searchRecipes";
import type { RecipeBookState } from "@/games/wow-forever/types/recipes/recipeBookState";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

interface RecipeGoalPickerProps {
  book: RecipeBookState;
  chosen: readonly string[];
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
}

const NO_ENTRIES: readonly RecipeEntry[] = [];

/** "Recipes you want": search every recipe by name, pick it, and it joins the plan as a chip. */
export default function RecipeGoalPicker({ book, chosen, onAdd, onRemove }: RecipeGoalPickerProps) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const listId = useId();
  const entries = book.status === LOAD_STATUS.ready ? book.entries : NO_ENTRIES;
  const byKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries]);
  const typed = deferred.trim() !== "";
  const matches = useMemo(
    () => (typed ? searchRecipes(entries, { query: deferred, profession: undefined, category: undefined }).slice(0, RECIPE_RESULT_LIMIT) : []),
    [entries, deferred, typed],
  );
  const picked = chosen.flatMap((key) => {
    const entry = byKey.get(key);
    return entry ? [entry] : [];
  });

  return (
    <section className="space-y-3" aria-labelledby="goal-recipes-heading">
      <h2 id="goal-recipes-heading" className="text-lg font-semibold">
        {GOAL_PLANNER_TEXT.recipesHeading}
      </h2>
      {picked.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="recipe-goal-chips">
          {picked.map((entry) => (
            <RecipeGoalChip key={entry.key} entry={entry} onRemove={() => onRemove(entry.key)} />
          ))}
        </ul>
      ) : null}
      {book.status === LOAD_STATUS.error ? <LoadErrorRetry message={GOAL_PLANNER_TEXT.recipeLoadError} onRetry={book.retry} retrying={false} /> : null}
      <label className="flex flex-col gap-1 text-sm sm:max-w-md">
        <span className="font-medium">{GOAL_PLANNER_TEXT.recipeSearchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={GOAL_PLANNER_TEXT.recipeSearchPlaceholder}
          aria-controls={listId}
          disabled={book.status !== LOAD_STATUS.ready}
          aria-busy={book.status === LOAD_STATUS.loading}
          className="min-h-[44px] rounded-md border bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
          data-testid="recipe-goal-search"
        />
      </label>
      <ul id={listId} className="space-y-1 sm:max-w-md" aria-live="polite">
        {matches.map(({ entry }) => (
          <RecipeGoalResult key={entry.key} entry={entry} added={chosen.includes(entry.key)} onAdd={() => onAdd(entry.key)} />
        ))}
        {typed && matches.length === 0 ? <li className="text-sm text-muted-foreground">{GOAL_PLANNER_TEXT.recipeNoMatch}</li> : null}
      </ul>
    </section>
  );
}
