import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimation,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import GroupCard from "@/games/wow-forever/components/raidPlanner/GroupCard";
import PlayerChipFace from "@/games/wow-forever/components/raidPlanner/PlayerChipFace";
import UnassignedPool from "@/games/wow-forever/components/raidPlanner/UnassignedPool";
import {
  MOUSE_ACTIVATION,
  PLANNER_GROUPS_CLASS,
  PLANNER_LAYOUT_CLASS,
  TOUCH_ACTIVATION,
} from "@/games/wow-forever/data/raidPlanner";
import { usePrefersReducedMotion } from "@/games/wow-forever/hooks/usePrefersReducedMotion";
import { PLANNER_INSTRUCTIONS, plannerAnnouncements } from "@/games/wow-forever/lib/plannerAnnouncements";
import { plannerCollisions } from "@/games/wow-forever/lib/plannerCollisions";
import { numbersTo, parseSlotId, unplacedOf } from "@/games/wow-forever/lib/raidGroups";
import { slotKeyboardCoordinates } from "@/games/wow-forever/lib/slotKeyboardCoordinates";
import type { PlanPlayer, PlannerBoard } from "@/games/wow-forever/types/raidPlan";

interface GroupPlannerProps {
  board: PlannerBoard;
}

/**
 * "Not in a group" beside the raid's groups. A player is dragged by their handle — with a mouse once it moves 4 px,
 * a finger once it rests 200 ms (so a swipe still scrolls), or the keyboard: Space, the arrows, Space — or moved with
 * their Move-to list. Dropped on someone, the two swap.
 */
export default function GroupPlanner({ board }: GroupPlannerProps) {
  const { plan, placements, onPlace } = board;
  const [activeId, setActiveId] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: MOUSE_ACTIVATION }),
    useSensor(TouchSensor, { activationConstraint: TOUCH_ACTIVATION }),
    useSensor(KeyboardSensor, { coordinateGetter: slotKeyboardCoordinates }),
  );
  const players = useMemo(() => new Map(plan.players.map((player) => [player.id, player])), [plan.players]);
  const lifted = liftedPlayer(players, activeId);

  const onDragStart = ({ active }: DragStartEvent) => setActiveId(String(active.id));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (over !== null) onPlace(String(active.id), parseSlotId(String(over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={plannerCollisions}
      accessibility={{
        announcements: plannerAnnouncements(players, placements),
        screenReaderInstructions: PLANNER_INSTRUCTIONS,
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className={PLANNER_LAYOUT_CLASS}>
        <UnassignedPool players={unplacedOf(plan.players, placements)} board={board} />
        <div className="@container min-w-0">
          <div className={PLANNER_GROUPS_CLASS}>
            {numbersTo(plan.group_count).map((group) => (
              <GroupCard key={group} group={group} board={board} />
            ))}
          </div>
        </div>
      </div>
      <DragOverlay dropAnimation={dropAnimationFor(reducedMotion)}>
        {lifted && <PlayerChipFace player={lifted} iconsVersion={plan.icons_version} lifted />}
      </DragOverlay>
    </DndContext>
  );
}

function liftedPlayer(players: ReadonlyMap<string, PlanPlayer>, activeId: string | null): PlanPlayer | undefined {
  if (activeId === null) return undefined;
  return players.get(activeId);
}

/** The lifted chip settles into its seat — or, for a viewer who asked for less motion, is simply there. */
function dropAnimationFor(reducedMotion: boolean): DropAnimation | null {
  if (reducedMotion) return null;
  return defaultDropAnimation;
}
