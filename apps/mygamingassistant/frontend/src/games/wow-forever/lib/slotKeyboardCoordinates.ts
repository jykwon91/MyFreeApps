/**
 * The planner's keyboard drag (dnd-kit's `KeyboardSensor`): an arrow key jumps the lifted player to the neighbouring
 * seat that way — or to "Not in a group" — instead of nudging them 25 px. Space or Enter lifts and drops, and Esc
 * cancels: the sensor's own keys.
 *
 * The lifted chip's centre lands inside the target, which is how the planner's collision detection finds it
 * (`lib/plannerCollisions.ts`).
 */
import type { ClientRect, KeyboardCoordinateGetter } from "@dnd-kit/core";

export interface Point {
  x: number;
  y: number;
}

export interface DropTarget {
  id: string;
  rect: ClientRect;
}

const DIRECTIONS: Readonly<Partial<Record<string, Point>>> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/** How much a step sideways counts against a target, next to a step the arrow's way: keep to the same line. */
const ACROSS_WEIGHT = 2;
/** Where the chip's centre lands: this far in from a target's edges, or its middle when it's smaller. */
const ENTRY_INSET = 22;
/** A target must be at least this far the arrow's way. */
const MIN_STEP = 1;

/** Where in `rect` the lifted chip's centre goes: the point nearest `from`, `ENTRY_INSET` in from the edges. */
export function entryPoint(rect: ClientRect, from: Point): Point {
  const insetX = Math.min(ENTRY_INSET, rect.width / 2);
  const insetY = Math.min(ENTRY_INSET, rect.height / 2);
  return {
    x: clamp(from.x, rect.left + insetX, rect.right - insetX),
    y: clamp(from.y, rect.top + insetY, rect.bottom - insetY),
  };
}

/** The target an arrow key (`event.code`) leads to from `from`, and where in it the chip goes; null when none. */
export function nextDropTarget(
  code: string,
  from: Point,
  targets: readonly DropTarget[],
): { id: string; point: Point } | null {
  const direction = DIRECTIONS[code];
  if (direction === undefined) return null;
  let best: { id: string; point: Point; score: number } | null = null;
  for (const target of targets) {
    // The seat the chip is over now.
    if (contains(target.rect, from)) continue;
    const point = entryPoint(target.rect, from);
    const dx = point.x - from.x;
    const dy = point.y - from.y;
    const along = dx * direction.x + dy * direction.y;
    if (along < MIN_STEP) continue;
    const across = Math.abs(dx * direction.y) + Math.abs(dy * direction.x);
    const score = along + across * ACROSS_WEIGHT;
    if (best === null || score < best.score) best = { id: target.id, point, score };
  }
  if (best === null) return null;
  return { id: best.id, point: best.point };
}

/** dnd-kit's coordinate getter: moves the lifted chip so its centre lands in the next seat the arrow points to. */
export const slotKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  if (DIRECTIONS[event.code] === undefined) return undefined;
  // An arrow moves the chip, never the page.
  event.preventDefault();
  const { collisionRect, droppableContainers, droppableRects } = context;
  if (collisionRect === null) return undefined;
  const from = centerOf(collisionRect);
  const targets: DropTarget[] = [];
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id);
    if (rect) targets.push({ id: String(container.id), rect });
  }
  const next = nextDropTarget(event.code, from, targets);
  if (next === null) return undefined;
  return { x: currentCoordinates.x + next.point.x - from.x, y: currentCoordinates.y + next.point.y - from.y };
};

export function centerOf(rect: ClientRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function contains(rect: ClientRect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
