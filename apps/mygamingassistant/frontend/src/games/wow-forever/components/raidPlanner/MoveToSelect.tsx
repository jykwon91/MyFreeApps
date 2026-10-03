import { cn } from "@platform/ui";
import { ArrowRightLeft } from "lucide-react";
import { GROUP_SIZE, PLANNER_ICON_BUTTON_CLASS, POOL_ID } from "@/games/wow-forever/data/raidPlanner";
import { numbersTo, occupantOf, parseSlotId, sameSeat, slotId } from "@/games/wow-forever/lib/raidGroups";
import { moveOptionLabel } from "@/games/wow-forever/lib/raidPlanLabels";
import type { PlanPlayer, PlannerBoard } from "@/games/wow-forever/types/raidPlan";

/** The theme's colours on the list itself: a native list draws its own popup, from the select's and options' styles. */
const LIST_COLOURS = "bg-card text-foreground";
/** The list itself: invisible over the icon, its whole 44 px the tap target. */
const SELECT_CLASS = "absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed";

interface MoveToSelectProps {
  player: PlanPlayer;
  board: PlannerBoard;
}

/**
 * Moving a player without dragging — the phone's own picker, or the keyboard: to "Not in a group", or to any seat, a
 * taken one swapping the two. A 44 px icon over a native list.
 */
export default function MoveToSelect({ player, board }: MoveToSelectProps) {
  const { plan, placements, locked, onPlace } = board;
  const here = placements[player.id];
  const names = new Map(plan.players.map((other) => [other.id, other.name]));
  const label = `Move ${player.name} to`;
  return (
    <span
      className={cn(
        PLANNER_ICON_BUTTON_CLASS,
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-sky-500",
      )}
    >
      <ArrowRightLeft aria-hidden className="pointer-events-none h-4 w-4" />
      <select
        value=""
        aria-label={label}
        title={label}
        disabled={locked}
        onChange={(event) => onPlace(player.id, parseSlotId(event.target.value))}
        className={cn(SELECT_CLASS, LIST_COLOURS)}
      >
        <option value="" disabled hidden>
          Move to
        </option>
        <option value={POOL_ID} disabled={here === undefined} className={LIST_COLOURS}>
          Not in a group
        </option>
        {numbersTo(plan.group_count).map((group) => (
          <optgroup key={group} label={`Group ${group}`} className={LIST_COLOURS}>
            {numbersTo(GROUP_SIZE).map((slot) => {
              const seat = { group, slot };
              const isHere = sameSeat(here, seat);
              return (
                <option key={slot} value={slotId(seat)} disabled={isHere} className={LIST_COLOURS}>
                  {moveOptionLabel(slot, nameOf(names, occupantOf(placements, seat)), isHere)}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </span>
  );
}

function nameOf(names: ReadonlyMap<string, string>, id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  return names.get(id);
}
