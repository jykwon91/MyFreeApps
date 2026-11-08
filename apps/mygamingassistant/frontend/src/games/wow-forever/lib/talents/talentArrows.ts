import { TALENT_ARROW_HEAD_PX, TALENT_CELL_PX, TALENT_GAP_PX } from "@/games/wow-forever/data/talents/talentGridLayout";
import type { TalentArrow } from "@/games/wow-forever/types/talents/talentArrow";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

const STEP = TALENT_CELL_PX + TALENT_GAP_PX;
const HALF = TALENT_CELL_PX / 2;

function cellLeft(column: number): number {
  return column * STEP;
}

function cellTop(tier: number): number {
  return tier * STEP;
}

function point(x: number, y: number): string {
  return `${x},${y}`;
}

/** The arrowhead at (x, y) pointing down, right or left. */
function head(x: number, y: number, direction: "down" | "right" | "left"): string {
  const h = TALENT_ARROW_HEAD_PX;
  if (direction === "down") return [point(x - h, y - h), point(x + h, y - h), point(x, y)].join(" ");
  const back = direction === "right" ? x - h : x + h;
  return [point(back, y - h), point(back, y + h), point(x, y)].join(" ");
}

/**
 * Every prerequisite arrow of a tree. Straight down when the talents share a
 * column, straight across when they share a row, else across the required
 * talent's row and then down — as the game draws them.
 */
export function talentArrows(tree: TalentTree): TalentArrow[] {
  return tree.talents.flatMap((talent, to) =>
    talent.prereqs.map(({ talentIndex: from }): TalentArrow => {
      const source = tree.talents[from];
      const targetX = cellLeft(talent.column) + HALF;
      if (source.tier === talent.tier) {
        const rightward = talent.column > source.column;
        const y = cellTop(talent.tier) + HALF;
        const startX = cellLeft(source.column) + (rightward ? TALENT_CELL_PX : 0);
        const endX = cellLeft(talent.column) + (rightward ? 0 : TALENT_CELL_PX);
        return { to, from, line: [point(startX, y), point(endX, y)].join(" "), head: head(endX, y, rightward ? "right" : "left") };
      }
      const endY = cellTop(talent.tier);
      if (source.column === talent.column) {
        const startY = cellTop(source.tier) + TALENT_CELL_PX;
        return { to, from, line: [point(targetX, startY), point(targetX, endY)].join(" "), head: head(targetX, endY, "down") };
      }
      const rightward = talent.column > source.column;
      const y = cellTop(source.tier) + HALF;
      const startX = cellLeft(source.column) + (rightward ? TALENT_CELL_PX : 0);
      return {
        to,
        from,
        line: [point(startX, y), point(targetX, y), point(targetX, endY)].join(" "),
        head: head(targetX, endY, "down"),
      };
    }),
  );
}

/** A cell's top-left corner in the grid, in CSS pixels. */
export function talentCellOffset(tier: number, column: number): { left: number; top: number } {
  return { left: cellLeft(column), top: cellTop(tier) };
}
