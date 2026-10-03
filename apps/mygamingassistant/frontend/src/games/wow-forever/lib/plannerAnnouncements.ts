/**
 * What a screen reader hears while a player is dragged in the planner (dnd-kit's `accessibility`): "Picked up Bob.",
 * "Bob is over Group 2 slot 3, where Alice sits.", "Dropped Bob in Group 2 slot 3. Swapped with Alice." Each player's
 * Move-to list is the other way to do the same.
 *
 * dnd-kit reads these the moment a drop lands, before the groups re-render, so `placements` is still the seating the
 * drop changes.
 */
import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core";
import { occupantOf, parseSlotId, sameSeat } from "@/games/wow-forever/lib/raidGroups";
import type { Placements, PlanPlayer } from "@/games/wow-forever/types/raidPlan";

export const PLANNER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable:
    "To pick up a player, press Space or Enter. Use the arrow keys to move them between seats, then press Space or " +
    "Enter to drop them there, or Escape to put them back. Each player's Move-to list does the same.",
};

/** A drop target, for a screen reader: "Group 2 slot 3", or "Not in a group". */
export function targetLabel(droppableId: UniqueIdentifier): string {
  const seat = parseSlotId(String(droppableId));
  if (seat === null) return "Not in a group";
  return `Group ${seat.group} slot ${seat.slot}`;
}

/** The words for a drag over `placements`. */
export function plannerAnnouncements(players: ReadonlyMap<string, PlanPlayer>, placements: Placements): Announcements {
  const nameOf = (id: UniqueIdentifier): string => players.get(String(id))?.name ?? "The player";
  // Whoever sits where the drop target is, other than the one being moved.
  const sitterAt = (targetId: UniqueIdentifier, moverId: UniqueIdentifier): string | undefined => {
    const seat = parseSlotId(String(targetId));
    if (seat === null) return undefined;
    const sitter = occupantOf(placements, seat);
    if (sitter === undefined || sitter === String(moverId)) return undefined;
    return nameOf(sitter);
  };

  return {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => {
      const name = nameOf(active.id);
      if (over === null) return `${name} is not over a seat.`;
      const sitter = sitterAt(over.id, active.id);
      if (sitter === undefined) return `${name} is over ${targetLabel(over.id)}.`;
      return `${name} is over ${targetLabel(over.id)}, where ${sitter} sits.`;
    },
    onDragEnd: ({ active, over }) => {
      const name = nameOf(active.id);
      if (over === null) return `${name} was put back where they were.`;
      const from = placements[String(active.id)];
      const seat = parseSlotId(String(over.id));
      if (seat === null && from === undefined) return `${name} stays out of the groups.`;
      if (seat === null) return `Moved ${name} out of the groups.`;
      if (sameSeat(from, seat)) return `${name} stays in ${targetLabel(over.id)}.`;
      const dropped = `Dropped ${name} in ${targetLabel(over.id)}.`;
      const sitter = sitterAt(over.id, active.id);
      if (sitter === undefined) return dropped;
      if (from === undefined) return `${dropped} ${sitter} is now not in a group.`;
      return `${dropped} Swapped with ${sitter}.`;
    },
    onDragCancel: ({ active }) => `Put ${nameOf(active.id)} back where they were.`,
  };
}
