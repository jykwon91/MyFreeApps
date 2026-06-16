import { Skeleton } from "@platform/ui";

/**
 * Mirrors the loaded recipes grid: a responsive set of recipe cards, each with
 * a title line, a meta row, and a footer stat row. Card count and internal
 * element widths match RecipeCard so there is no layout shift on load.
 */
export default function RecipesListSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading recipes"
      aria-busy="true"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card border rounded-lg p-5 space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex items-center justify-between pt-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
