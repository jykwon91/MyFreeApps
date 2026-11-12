import clsx from "clsx";
import { Skeleton } from "@platform/ui";
import { TALENT_SKELETON_CELLS } from "@/games/wow-forever/data/talents/talentConfig";
import { TALENT_CELL_PX, TALENT_GRID_HEIGHT_PX, TALENT_GRID_WIDTH_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import { talentCellOffset } from "@/games/wow-forever/lib/talents/talentArrows";

/** A tree card's shape while it loads; below `lg` only the first tree shows (the others sit behind tabs). */
export default function TalentTreeSkeleton({ index }: { index: number }) {
  return (
    <div className={clsx("rounded-xl border bg-card p-4 space-y-4", index > 0 && "hidden lg:block")} data-testid="talent-tree-skeleton">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="ml-auto h-4 w-16" />
      </div>
      <div className="relative mx-auto" style={{ width: TALENT_GRID_WIDTH_PX, height: TALENT_GRID_HEIGHT_PX }}>
        {TALENT_SKELETON_CELLS.map(([tier, column]) => {
          const { left, top } = talentCellOffset(tier, column);
          return (
            <div key={`${tier}-${column}`} className="absolute" style={{ left, top, width: TALENT_CELL_PX, height: TALENT_CELL_PX }}>
              <Skeleton className="h-full w-full rounded-md" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
