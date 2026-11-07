import { Skeleton } from "@platform/ui";
import { DUNGEON_LIST_SKELETON_ROWS } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";

/** Stand-in while the dungeon data loads: the list's card, tag line and rows in the same places. */
export default function DungeonListSkeleton() {
  return (
    <div aria-hidden className="rounded-xl border bg-card" data-testid="dungeon-list-skeleton">
      <div className="border-b px-4 py-3">
        <Skeleton className="h-5 w-56" />
      </div>
      <div className="divide-y">
        {Array.from({ length: DUNGEON_LIST_SKELETON_ROWS }, (_, i) => (
          <div key={i} className="space-y-1.5 px-4 py-3 min-h-[56px]">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
