/**
 * Which seat a lifted player is over (dnd-kit's `collisionDetection`).
 *
 * A pointer picks what's under it, so a chip dragged across a card's edge never lands in a neighbouring seat, and a
 * drop between cards does nothing. A keyboard drag has no pointer, so the chip's own centre picks — the arrow keys put
 * it inside the next seat (`lib/slotKeyboardCoordinates.ts`) — and failing that, the nearest seat.
 */
import { closestCenter, pointerWithin, type CollisionDetection } from "@dnd-kit/core";
import { centerOf } from "@/games/wow-forever/lib/slotKeyboardCoordinates";

export const plannerCollisions: CollisionDetection = (args) => {
  if (args.pointerCoordinates) return pointerWithin(args);
  const within = pointerWithin({ ...args, pointerCoordinates: centerOf(args.collisionRect) });
  if (within.length > 0) return within;
  return closestCenter(args);
};
