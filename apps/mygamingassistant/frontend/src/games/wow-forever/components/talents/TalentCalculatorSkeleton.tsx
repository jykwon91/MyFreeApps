import { Skeleton } from "@platform/ui";
import TalentTreeSkeleton from "@/games/wow-forever/components/talents/TalentTreeSkeleton";
import { TALENT_TREE_COUNT } from "@/games/wow-forever/data/talents/talentConfig";

/**
 * Stand-in while a class's trees load: the settings card, the tabs (below
 * `lg`) and three tree cards with their grids, in the same places.
 */
export default function TalentCalculatorSkeleton() {
  return (
    <div aria-hidden className="space-y-4" data-testid="talent-calculator-skeleton">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border bg-card p-4">
        <Skeleton className="h-11 w-44" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-11 w-48 sm:ml-auto" />
      </div>
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-[54px] w-full lg:hidden" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: TALENT_TREE_COUNT }, (_, t) => (
          <TalentTreeSkeleton key={t} index={t} />
        ))}
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}
