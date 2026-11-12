import { Skeleton } from "@platform/ui";
import TalentTreeSkeleton from "@/games/wow-forever/components/talents/TalentTreeSkeleton";
import { TALENT_TREE_COUNT } from "@/games/wow-forever/data/talents/talentConfig";

/** The talents section's shape while it loads: the point split and link, the tabs (below `lg`), the three trees and the details card. */
export default function CharacterTalentsSkeleton() {
  return (
    <div className="space-y-3" aria-hidden data-testid="character-talents-skeleton">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: TALENT_TREE_COUNT }, (_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
        <Skeleton className="h-11 w-48 sm:ml-auto" />
      </div>
      <Skeleton className="h-[54px] w-full lg:hidden" />
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: TALENT_TREE_COUNT }, (_, t) => (
          <TalentTreeSkeleton key={t} index={t} />
        ))}
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}
