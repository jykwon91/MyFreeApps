import type { ClientRect } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { centerOf, entryPoint, nextDropTarget, type DropTarget } from "@/games/wow-forever/lib/slotKeyboardCoordinates";

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

/** A group's five 50 px seats in a 200 px column from `left`. */
function seats(group: number, left: number): DropTarget[] {
  return [1, 2, 3, 4, 5].map((slot) => ({ id: `slot:${group}:${slot}`, rect: rect(left, (slot - 1) * 50, 200, 50) }));
}

/** "Not in a group" on the left, then Group 1 and Group 2 beside it. */
const TARGETS: readonly DropTarget[] = [{ id: "pool", rect: rect(0, 0, 200, 300) }, ...seats(1, 220), ...seats(2, 440)];
const GROUP_1_SLOT_1 = centerOf(rect(220, 0, 200, 50));

describe("the planner's arrow keys", () => {
  it.each([
    ["ArrowDown", "slot:1:2"],
    ["ArrowRight", "slot:2:1"],
    ["ArrowLeft", "pool"],
  ])("%s from Group 1 slot 1 leads to %s", (code, id) => {
    expect(nextDropTarget(code, GROUP_1_SLOT_1, TARGETS)?.id).toBe(id);
  });

  it("keeps to the same row going sideways", () => {
    expect(nextDropTarget("ArrowRight", centerOf(rect(220, 150, 200, 50)), TARGETS)?.id).toBe("slot:2:4");
  });

  it("lands the lifted player inside the next seat, near where they came from", () => {
    expect(nextDropTarget("ArrowDown", GROUP_1_SLOT_1, TARGETS)?.point).toEqual({ x: 320, y: 72 });
  });

  it("finds nothing past the edge, or for a key that isn't an arrow", () => {
    expect(nextDropTarget("ArrowUp", GROUP_1_SLOT_1, TARGETS)).toBeNull();
    expect(nextDropTarget("ArrowRight", centerOf(rect(440, 0, 200, 50)), TARGETS)).toBeNull();
    expect(nextDropTarget("Space", GROUP_1_SLOT_1, TARGETS)).toBeNull();
  });
});

describe("entryPoint", () => {
  it("keeps the point 22 px inside a target's edges", () => {
    expect(entryPoint(rect(100, 100, 200, 50), { x: 0, y: 0 })).toEqual({ x: 122, y: 122 });
    expect(entryPoint(rect(100, 100, 200, 50), { x: 500, y: 500 })).toEqual({ x: 278, y: 128 });
  });

  it("uses a small target's middle", () => {
    expect(entryPoint(rect(0, 0, 30, 30), { x: 100, y: 100 })).toEqual({ x: 15, y: 15 });
  });
});
