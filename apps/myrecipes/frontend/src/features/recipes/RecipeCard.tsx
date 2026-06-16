import { Link } from "react-router-dom";
import { GitBranch } from "lucide-react";
import { Badge, formatDate } from "@platform/ui";
import StarRating from "@/features/recipes/StarRating";
import type { RecipeSummary } from "@/types/recipe/recipe";

interface Props {
  recipe: RecipeSummary;
}

/**
 * A single recipe in the list grid. Surfaces the four data points that answer
 * "which recipe, how evolved, how good, how recently cooked": title, latest
 * version number, best rating (as stars), version count, and last-cooked date.
 */
export default function RecipeCard({ recipe }: Props) {
  const versionLabel =
    recipe.latest_version_number === null
      ? "Draft"
      : `v${recipe.latest_version_number}`;

  return (
    <Link
      to={`/recipes/${recipe.id}`}
      className="bg-card border rounded-lg p-5 flex flex-col gap-3 hover:border-primary/50 hover:shadow-sm transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-semibold leading-tight line-clamp-2">{recipe.title}</h2>
        <Badge label={versionLabel} color="blue" />
      </div>

      {recipe.description ? (
        <p className="text-sm text-muted-foreground line-clamp-2">
          {recipe.description}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground/60 italic">No description</p>
      )}

      <div className="mt-auto flex items-center justify-between pt-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="w-4 h-4" aria-hidden />
          {recipe.version_count} version{recipe.version_count === 1 ? "" : "s"}
        </span>
        <StarRating value={recipe.best_rating} showEmptyDash />
      </div>

      <div className="text-xs text-muted-foreground">
        {recipe.last_cooked_at
          ? `Last cooked ${formatDate(recipe.last_cooked_at)}`
          : "Not cooked yet"}
      </div>
    </Link>
  );
}
