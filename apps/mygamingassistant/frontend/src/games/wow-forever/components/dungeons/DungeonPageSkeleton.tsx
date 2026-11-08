import { Skeleton } from "@platform/ui";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import {
  DUNGEON_SKELETON_BOSSES,
  DUNGEON_SKELETON_FACTS,
  DUNGEON_SKELETON_LOOT_ROWS,
  DUNGEON_SKELETON_QUESTS,
} from "@/games/wow-forever/data/dungeons/dungeonPageConfig";

/** Stand-in while the dungeon data loads: header, when / where, quests, boss list and boss sections in the same places. */
export default function DungeonPageSkeleton() {
  return (
    <div aria-hidden className="space-y-4" data-testid="dungeon-page-skeleton">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <div className={DETAIL_SECTION}>
        <Skeleton className="h-5 w-36" />
        {Array.from({ length: DUNGEON_SKELETON_FACTS }, (_, i) => (
          <Skeleton key={i} className="h-4 w-2/3" />
        ))}
      </div>
      <div className={DETAIL_SECTION}>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className={DETAIL_SECTION} data-testid="dungeon-quests-skeleton">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-11 w-48 sm:h-9" />
        {Array.from({ length: DUNGEON_SKELETON_QUESTS }, (_, i) => (
          <div key={i} className="flex items-center gap-2 min-h-[44px]">
            <Skeleton className="h-4 w-4 shrink-0" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </div>
      <div className={DETAIL_SECTION}>
        <Skeleton className="h-5 w-24" />
        {Array.from({ length: DUNGEON_SKELETON_BOSSES }, (_, i) => (
          <Skeleton key={i} className="h-4 w-40" />
        ))}
      </div>
      {Array.from({ length: DUNGEON_SKELETON_BOSSES }, (_, i) => (
        <div key={i} className={DETAIL_SECTION}>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-20" />
          {Array.from({ length: DUNGEON_SKELETON_LOOT_ROWS }, (_, j) => (
            <div key={j} className="flex items-center gap-3 min-h-[44px]">
              <Skeleton className="h-6 w-6 shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-10 shrink-0" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
