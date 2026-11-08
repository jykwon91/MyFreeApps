import { Skeleton } from "@platform/ui";

const CARDS = 3;

/** Placeholder vendor cards (heading lines + Directions + the recipe count) while the recipes load. */
export default function RecipeVendorsSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden data-testid="recipe-vendors-skeleton">
      {Array.from({ length: CARDS }, (_, i) => (
        <li key={i} className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="h-4 w-1/3" />
        </li>
      ))}
    </ul>
  );
}
