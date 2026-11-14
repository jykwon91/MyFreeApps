import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { RECIPES_TEXT } from "@/games/wow-forever/data/recipes/recipesConfig";

const ROWS = 6;
/** "All" plus the eight professions. */
const PROFESSION_BUTTONS = 9;

/** The search box, the profession buttons, the Makes filter and then a few closed recipe rows (or the prompt card), while the recipes load. */
interface RecipesSkeletonProps {
  /** The URL already has a search or filter: rows will load; else the prompt card. */
  listing: boolean;
}

export default function RecipesSkeleton({ listing }: RecipesSkeletonProps) {
  return (
    <div className="space-y-4 animate-pulse" aria-hidden data-testid="recipes-skeleton">
      <div className="space-y-1">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="h-11 w-full rounded-md bg-muted" />
      </div>
      <div className="space-y-1">
        <div className="h-5 w-20 rounded bg-muted" />
        <div className="grid grid-cols-3 gap-1 rounded-lg border bg-card p-1 sm:grid-cols-5">
          {Array.from({ length: PROFESSION_BUTTONS }, (_, i) => (
            <div key={i} className="h-[54px] rounded-md bg-muted sm:h-9" />
          ))}
        </div>
      </div>
      <div className="h-[68px] rounded-md bg-muted sm:w-1/2" />
      {listing ? (
        <ul className="space-y-2">
          {Array.from({ length: ROWS }, (_, i) => (
            <li key={i} className="h-[96px] rounded-lg border bg-card" />
          ))}
        </ul>
      ) : (
        <div data-testid="recipes-skeleton-prompt">
          {/* Fixed copy, not data: the real prompt, so it wraps exactly like the loaded one. */}
          <EmptyStateNote message={RECIPES_TEXT.prompt} />
        </div>
      )}
    </div>
  );
}
