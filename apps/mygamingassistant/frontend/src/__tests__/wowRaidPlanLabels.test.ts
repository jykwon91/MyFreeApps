import type { Active, Over, UniqueIdentifier } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { DISPLAY_ROLE } from "@/games/wow-forever/data/raidPage";
import { PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import { PLANNER_INSTRUCTIONS, plannerAnnouncements, targetLabel } from "@/games/wow-forever/lib/plannerAnnouncements";
import { placementsOf } from "@/games/wow-forever/lib/raidGroups";
import { NO_RESPONSE_MESSAGE, RATE_LIMITED_MESSAGE } from "@/games/wow-forever/lib/raidPageError";
import { REFUSAL, isLinkProblem, planRefusal } from "@/games/wow-forever/lib/raidPlanError";
import {
  chipLabel,
  moveOptionLabel,
  savedMessage,
  sizeLabel,
  tallyLong,
  tallyShort,
  unplacedLabel,
} from "@/games/wow-forever/lib/raidPlanLabels";
import { FIRST_SEATS, PLAYERS, idOf, seated } from "@/test/raidPlanFixtures";

function active(name: string): Active {
  const id: UniqueIdentifier = idOf(name);
  return { id } as Active;
}

function over(id: UniqueIdentifier): Over {
  return { id } as Over;
}

describe("the planner's words", () => {
  it("tallies a group's roles, short and for a screen reader", () => {
    const tally = {
      [DISPLAY_ROLE.TANK]: 1,
      [DISPLAY_ROLE.HEALER]: 2,
      [DISPLAY_ROLE.MELEE]: 2,
      [DISPLAY_ROLE.RANGED]: 0,
    };
    expect(tallyShort(tally)).toBe("T1 H2 M2 R0");
    expect(tallyLong(tally)).toBe("1 tank, 2 healers, 2 melee, 0 ranged");
  });

  it("sizes the raid, names a handle, and says what each Move-to option does", () => {
    expect(sizeLabel(40, 8)).toBe("40-man (8 groups)");
    expect(sizeLabel(5, 1)).toBe("5-man (1 group)");
    const jory = { name: "Jory", spec: "Destruction Warlock", late: true };
    expect(chipLabel(jory)).toBe("Jory, Destruction Warlock, late");
    expect(chipLabel({ name: "Isla", spec: null, late: false })).toBe("Isla");
    expect(moveOptionLabel(3, undefined, false)).toBe("Slot 3 — empty");
    expect(moveOptionLabel(3, "Alice", false)).toBe("Slot 3 — swap with Alice");
    expect(moveOptionLabel(3, "Bob", true)).toBe("Slot 3 — here");
  });

  it("says who a save took out, and who is in no group yet", () => {
    expect(savedMessage(0)).toBe("Groups saved");
    expect(savedMessage(1)).toBe("Groups saved — 1 player who left their seat was taken out.");
    expect(savedMessage(3)).toBe("Groups saved — 3 players who left their seats were taken out.");
    expect(unplacedLabel(1)).toBe("Not in a group yet: 1 seated player");
    expect(unplacedLabel(4)).toBe("Not in a group yet: 4 seated players");
  });
});

describe("what a screen reader hears during a drag", () => {
  const players = new Map(PLAYERS.map((player) => [player.id, player]));
  const say = plannerAnnouncements(players, placementsOf({ players: seated(FIRST_SEATS), group_count: 2 }));

  it("tells how, then who was picked up and what they're over", () => {
    expect(PLANNER_INSTRUCTIONS.draggable).toMatch(/^To pick up a player, press Space or Enter\./);
    expect(say.onDragStart({ active: active("Fenn") })).toBe("Picked up Fenn.");
    expect(say.onDragOver({ active: active("Fenn"), over: over("slot:1:1") })).toBe(
      "Fenn is over Group 1 slot 1, where Aldren sits.",
    );
    expect(say.onDragOver({ active: active("Fenn"), over: over("slot:1:4") })).toBe("Fenn is over Group 1 slot 4.");
    expect(say.onDragOver({ active: active("Fenn"), over: over("pool") })).toBe("Fenn is over Not in a group.");
    expect(say.onDragOver({ active: active("Fenn"), over: null })).toBe("Fenn is not over a seat.");
    expect(targetLabel("slot:2:5")).toBe("Group 2 slot 5");
  });

  it("says what a drop did", () => {
    expect(say.onDragEnd({ active: active("Aldren"), over: over("slot:1:2") })).toBe(
      "Dropped Aldren in Group 1 slot 2. Swapped with Brisa.",
    );
    expect(say.onDragEnd({ active: active("Fenn"), over: over("slot:1:1") })).toBe(
      "Dropped Fenn in Group 1 slot 1. Aldren is now not in a group.",
    );
    expect(say.onDragEnd({ active: active("Fenn"), over: over("slot:1:4") })).toBe("Dropped Fenn in Group 1 slot 4.");
    expect(say.onDragEnd({ active: active("Cael"), over: over("pool") })).toBe("Moved Cael out of the groups.");
    expect(say.onDragEnd({ active: active("Fenn"), over: over("pool") })).toBe("Fenn stays out of the groups.");
    expect(say.onDragEnd({ active: active("Aldren"), over: over("slot:1:1") })).toBe("Aldren stays in Group 1 slot 1.");
    expect(say.onDragEnd({ active: active("Aldren"), over: null })).toBe("Aldren was put back where they were.");
    expect(say.onDragCancel({ active: active("Aldren"), over: null })).toBe("Put Aldren back where they were.");
  });
});

describe("why the API refused the planner", () => {
  it.each([
    [{ status: 403, data: { detail: "plan_link_expired" } }, { kind: REFUSAL.LINK }],
    [{ status: 404, data: { detail: "raid_not_found" } }, { kind: REFUSAL.GONE }],
    [{ status: 409, data: { detail: "raid_over" } }, { kind: REFUSAL.OVER, message: PLANNER_MESSAGE.OVER }],
    [{ status: 409, data: { detail: "groups_changed" } }, { kind: REFUSAL.RELOAD, message: PLANNER_MESSAGE.CHANGED }],
    [
      { status: 422, data: { detail: "invalid_plan" } },
      { kind: REFUSAL.RELOAD, message: PLANNER_MESSAGE.ROSTER_CHANGED },
    ],
    [{ status: 429, data: { detail: "rate_limited" } }, { kind: REFUSAL.FAILED, message: RATE_LIMITED_MESSAGE }],
    [{ status: undefined, data: "Network Error" }, { kind: REFUSAL.FAILED, message: NO_RESPONSE_MESSAGE }],
    [{ status: 500, data: "" }, { kind: REFUSAL.FAILED, message: PLANNER_MESSAGE.SAVE_FAILED }],
  ])("reads %o", (error, refusal) => {
    expect(planRefusal(error)).toEqual(refusal);
  });

  it("uses the words it's given for a failure with none better", () => {
    expect(planRefusal({ status: 502, data: "" }, PLANNER_MESSAGE.RELOAD_FAILED)).toEqual({
      kind: REFUSAL.FAILED,
      message: PLANNER_MESSAGE.RELOAD_FAILED,
    });
  });

  it("knows a refused link", () => {
    expect(isLinkProblem({ status: 403, data: { detail: "plan_link_invalid" } })).toBe(true);
    expect(isLinkProblem({ status: 404, data: { detail: "raid_not_found" } })).toBe(false);
    expect(isLinkProblem(undefined)).toBe(false);
  });
});
