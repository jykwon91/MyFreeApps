import { useDraggable } from "@dnd-kit/core";
import { cn } from "@platform/ui";
import { StickyNote } from "lucide-react";
import { useId, useState } from "react";
import MoveToSelect from "@/games/wow-forever/components/raidPlanner/MoveToSelect";
import PlayerChipFace from "@/games/wow-forever/components/raidPlanner/PlayerChipFace";
import { RAID_FOCUS_RING_CLASS } from "@/games/wow-forever/data/raidPage";
import { PLANNER_HOVER_CLASS, PLANNER_ICON_BUTTON_CLASS } from "@/games/wow-forever/data/raidPlanner";
import { chipLabel } from "@/games/wow-forever/lib/raidPlanLabels";
import type { PlanPlayer, PlannerBoard } from "@/games/wow-forever/types/raidPlan";

/** The drag handle: the whole chip. A long press drags rather than selecting text or opening the phone's menu. */
const HANDLE_CLASS = [
  "flex min-h-[44px] min-w-0 flex-1 items-center rounded-md px-1 text-left",
  "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none]",
  PLANNER_HOVER_CLASS,
  RAID_FOCUS_RING_CLASS,
].join(" ");

interface PlayerChipProps {
  player: PlanPlayer;
  board: PlannerBoard;
}

/**
 * A seated player in the planner: their handle to drag, their note when they left one, and their Move-to list. In a
 * read-only planner, just who they are, and their note.
 */
export default function PlayerChip({ player, board }: PlayerChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: player.id,
    disabled: board.readOnly || board.locked,
  });
  const [noteOpen, setNoteOpen] = useState(false);
  const noteId = useId();
  const iconsVersion = board.plan.icons_version;
  return (
    <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-1", isDragging && "opacity-40")}>
      {board.readOnly && (
        <span className="flex min-h-[44px] min-w-0 flex-1 items-center px-1">
          <PlayerChipFace player={player} iconsVersion={iconsVersion} />
        </span>
      )}
      {!board.readOnly && (
        <button
          type="button"
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          aria-label={chipLabel(player)}
          className={HANDLE_CLASS}
        >
          <PlayerChipFace player={player} iconsVersion={iconsVersion} />
        </button>
      )}
      {player.note && (
        <button
          type="button"
          aria-expanded={noteOpen}
          aria-controls={noteId}
          aria-label={`Note from ${player.name}`}
          title="Note"
          onClick={() => setNoteOpen(!noteOpen)}
          className={PLANNER_ICON_BUTTON_CLASS}
        >
          <StickyNote aria-hidden className="h-4 w-4" />
        </button>
      )}
      {!board.readOnly && <MoveToSelect player={player} board={board} />}
      {player.note && (
        <p
          id={noteId}
          hidden={!noteOpen}
          className="basis-full whitespace-pre-wrap break-words rounded-md bg-muted px-2 py-1 text-sm"
        >
          {player.note}
        </p>
      )}
    </div>
  );
}
