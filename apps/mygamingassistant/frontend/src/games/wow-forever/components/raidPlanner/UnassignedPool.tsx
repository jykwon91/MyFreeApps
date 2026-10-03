import { useDroppable } from "@dnd-kit/core";
import { cn } from "@platform/ui";
import { useId } from "react";
import PlayerChip from "@/games/wow-forever/components/raidPlanner/PlayerChip";
import { PLANNER_MESSAGE, PLANNER_ROW_CLASS, POOL_ID } from "@/games/wow-forever/data/raidPlanner";
import type { PlanPlayer, PlannerBoard } from "@/games/wow-forever/types/raidPlan";

interface UnassignedPoolProps {
  /** The seated players in no group, in line order. */
  players: PlanPlayer[];
  board: PlannerBoard;
}

/** "Not in a group": the seated players in no group yet, in line order — and where a player is dropped to leave one. */
export default function UnassignedPool({ players, board }: UnassignedPoolProps) {
  const headingId = useId();
  const { setNodeRef, isOver } = useDroppable({ id: POOL_ID, disabled: board.readOnly });
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn("overflow-hidden rounded-lg border bg-card", isOver && "ring-2 ring-sky-500")}
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <h2 id={headingId} className="min-w-0 flex-1 text-sm font-semibold">
          Not in a group
        </h2>
        <span className="text-sm tabular-nums text-muted-foreground">{players.length}</span>
      </div>
      {players.length === 0 && (
        <p className="px-3 py-3 text-sm text-muted-foreground">{PLANNER_MESSAGE.EVERYONE_PLACED}</p>
      )}
      {players.length > 0 && (
        <ul aria-labelledby={headingId} className="divide-y">
          {players.map((player) => (
            <li key={player.id} className={PLANNER_ROW_CLASS}>
              <PlayerChip player={player} board={board} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
