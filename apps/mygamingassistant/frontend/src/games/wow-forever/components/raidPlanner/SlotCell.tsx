import { useDroppable } from "@dnd-kit/core";
import { cn } from "@platform/ui";
import PlayerChip from "@/games/wow-forever/components/raidPlanner/PlayerChip";
import { PLANNER_ROW_CLASS } from "@/games/wow-forever/data/raidPlanner";
import { slotId } from "@/games/wow-forever/lib/raidGroups";
import type { PlanPlayer, PlannerBoard, SlotRef } from "@/games/wow-forever/types/raidPlan";

/** An empty seat: a dashed box as tall as a player's handle. */
const EMPTY_SEAT_CLASS =
  "flex min-h-[44px] flex-1 items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground";

interface SlotCellProps {
  seat: SlotRef;
  /** Whoever sits there. */
  player: PlanPlayer | undefined;
  board: PlannerBoard;
}

/** A seat in a group: its number, then whoever sits there, or "Empty". A player dropped on it takes it. */
export default function SlotCell({ seat, player, board }: SlotCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: slotId(seat), disabled: board.readOnly });
  return (
    <li ref={setNodeRef} className={cn(PLANNER_ROW_CLASS, isOver && "bg-sky-500/10 ring-2 ring-inset ring-sky-500")}>
      <span aria-hidden className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {seat.slot}
      </span>
      {player && <PlayerChip player={player} board={board} />}
      {!player && (
        <span className={EMPTY_SEAT_CLASS}>Empty</span>
      )}
    </li>
  );
}
