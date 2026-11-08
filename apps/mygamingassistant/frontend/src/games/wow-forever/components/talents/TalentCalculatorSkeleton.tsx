import clsx from "clsx";
import { Skeleton } from "@platform/ui";
import { TALENT_SKELETON_CELLS, TALENT_TREE_COUNT } from "@/games/wow-forever/data/talents/talentConfig";
import { TALENT_CELL_PX, TALENT_GRID_HEIGHT_PX, TALENT_GRID_WIDTH_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import { talentCellOffset } from "@/games/wow-forever/lib/talents/talentArrows";

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
          <div
            key={t}
            className={clsx("rounded-xl border bg-card p-4 space-y-4", t > 0 && "hidden lg:block")}
            data-testid="talent-tree-skeleton"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="ml-auto h-4 w-16" />
            </div>
            <div className="relative mx-auto" style={{ width: TALENT_GRID_WIDTH_PX, height: TALENT_GRID_HEIGHT_PX }}>
              {TALENT_SKELETON_CELLS.map(([tier, column]) => {
                const { left, top } = talentCellOffset(tier, column);
                return (
                  <div
                    key={`${tier}-${column}`}
                    className="absolute"
                    style={{ left, top, width: TALENT_CELL_PX, height: TALENT_CELL_PX }}
                  >
                    <Skeleton className="h-full w-full rounded-md" />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}
