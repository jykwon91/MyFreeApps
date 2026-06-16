import { Clock, Soup, Users } from "lucide-react";
import type { VersionResponse } from "@/types/recipe/version";
import { formatIngredientLine } from "@/features/recipes/IngredientLine";

interface Props {
  version: VersionResponse;
}

/**
 * Read-only view of one version's body: servings/prep/cook metadata, the
 * ingredient list, and the numbered steps. Shown in the recipe detail's left
 * column for whichever version is currently selected in the timeline.
 */
export default function VersionBody({ version }: Props) {
  const hasMeta =
    version.servings !== null ||
    version.prep_minutes !== null ||
    version.cook_minutes !== null;

  return (
    <div className="space-y-6">
      {hasMeta ? (
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {version.servings !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-4 h-4" aria-hidden />
              {version.servings}
            </span>
          ) : null}
          {version.prep_minutes !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" aria-hidden />
              {version.prep_minutes} min prep
            </span>
          ) : null}
          {version.cook_minutes !== null ? (
            <span className="inline-flex items-center gap-1.5">
              <Soup className="w-4 h-4" aria-hidden />
              {version.cook_minutes} min cook
            </span>
          ) : null}
        </div>
      ) : null}

      <section className="bg-card border rounded-lg p-6">
        <h3 className="text-base font-medium mb-3">Ingredients</h3>
        {version.ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No ingredients.</p>
        ) : (
          <ul className="space-y-1.5">
            {version.ingredients.map((ingredient) => (
              <li key={ingredient.id} className="text-sm flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                <span>{formatIngredientLine(ingredient)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-card border rounded-lg p-6">
        <h3 className="text-base font-medium mb-3">Steps</h3>
        {version.steps.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No steps.</p>
        ) : (
          <ol className="space-y-3">
            {version.steps.map((step, idx) => (
              <li key={step.id} className="flex gap-3 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {idx + 1}
                </span>
                <span className="pt-0.5">{step.instruction}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
