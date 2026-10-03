import { describe, expect, it } from "vitest";
import { DISPLAY_ROLE } from "@/games/wow-forever/data/raidPage";
import {
  asText,
  autoFill,
  numbersTo,
  occupantOf,
  parseSlotId,
  placementsOf,
  roleTally,
  samePlacements,
  seatsOf,
  slotId,
  swapOrPlace,
  toPayload,
  unplacedOf,
} from "@/games/wow-forever/lib/raidGroups";
import { tallyShort } from "@/games/wow-forever/lib/raidPlanLabels";
import type { DisplayRole } from "@/games/wow-forever/types/raid";
import type { Placements, PlanPlayer } from "@/games/wow-forever/types/raidPlan";
import { FIRST_SEATS, PLAYERS, idOf, planPlayer, seated } from "@/test/raidPlanFixtures";

const FIRST = placementsOf({ players: seated(FIRST_SEATS), group_count: 2 });

/** Each group's players by name, in seat order — "" for an empty seat. */
function groupsOf(placements: Placements, groupCount = 2, players: readonly PlanPlayer[] = PLAYERS): string[][] {
  return numbersTo(groupCount).map((group) =>
    seatsOf(players, placements, group).map((player) => player?.name ?? ""),
  );
}

function names(players: readonly PlanPlayer[]): string[] {
  return players.map((player) => player.name);
}

/** A raid of `counts` players per role (null: no class yet), numbered in the order given. */
function roster(counts: readonly (readonly [DisplayRole | null, number])[]): PlanPlayer[] {
  const roles = counts.flatMap(([role, count]) => Array.from({ length: count }, () => role));
  return roles.map((role, index) => planPlayer({ number: index + 1, name: `Raider ${index + 1}`, role_group: role }));
}

describe("seats", () => {
  it("names a seat, and reads one back", () => {
    expect(slotId({ group: 2, slot: 3 })).toBe("slot:2:3");
    expect(parseSlotId("slot:2:3")).toEqual({ group: 2, slot: 3 });
    expect(parseSlotId("pool")).toBeNull();
    expect(parseSlotId("slot:2")).toBeNull();
  });

  it("seats the players as read, leaving out anyone in a group past the raid's last", () => {
    const players = seated({ ...FIRST_SEATS, Dara: { group: 3, slot: 1 } });
    const placements = placementsOf({ players, group_count: 2 });
    expect(groupsOf(placements)).toEqual([
      ["Aldren", "Brisa", "Cael", "", ""],
      ["Edda", "Gwyn", "", "", ""],
    ]);
    expect(placements[idOf("Dara")]).toBeUndefined();
    expect(occupantOf(placements, { group: 2, slot: 2 })).toBe(idOf("Gwyn"));
  });

  it("lists the players in no group in line order — numbered first, then by name", () => {
    expect(names(unplacedOf(PLAYERS, FIRST))).toEqual(["Dara", "Fenn", "Hale", "Isla", "Jory"]);
    const unnumbered = [
      planPlayer({ number: null, name: "Zed" }),
      planPlayer({ number: 2, name: "Bea" }),
      planPlayer({ number: null, name: "Abe" }),
      planPlayer({ number: 1, name: "Cid" }),
    ];
    expect(names(unplacedOf(unnumbered, {}))).toEqual(["Cid", "Bea", "Abe", "Zed"]);
  });

  it("tallies a group's roles", () => {
    expect(roleTally(seatsOf(PLAYERS, FIRST, 1))).toEqual({
      [DISPLAY_ROLE.TANK]: 1,
      [DISPLAY_ROLE.HEALER]: 1,
      [DISPLAY_ROLE.MELEE]: 1,
      [DISPLAY_ROLE.RANGED]: 0,
    });
  });
});

describe("swapOrPlace", () => {
  it("puts a player into an empty seat", () => {
    expect(groupsOf(swapOrPlace(FIRST, idOf("Fenn"), { group: 1, slot: 4 }))[0]).toEqual([
      "Aldren",
      "Brisa",
      "Cael",
      "Fenn",
      "",
    ]);
  });

  it("swaps two seated players", () => {
    expect(groupsOf(swapOrPlace(FIRST, idOf("Brisa"), { group: 2, slot: 1 }))).toEqual([
      ["Aldren", "Edda", "Cael", "", ""],
      ["Brisa", "Gwyn", "", "", ""],
    ]);
  });

  it("sends whoever sits there to no group when the mover had none", () => {
    const moved = swapOrPlace(FIRST, idOf("Fenn"), { group: 1, slot: 1 });
    expect(groupsOf(moved)[0]).toEqual(["Fenn", "Brisa", "Cael", "", ""]);
    expect(moved[idOf("Aldren")]).toBeUndefined();
  });

  it("takes a player out of the groups, and leaves one dropped on their own seat where they are", () => {
    expect(swapOrPlace(FIRST, idOf("Cael"), null)[idOf("Cael")]).toBeUndefined();
    expect(samePlacements(swapOrPlace(FIRST, idOf("Aldren"), { group: 1, slot: 1 }), FIRST)).toBe(true);
  });

  it("never changes the placements it was given", () => {
    const before = { ...FIRST };
    swapOrPlace(FIRST, idOf("Brisa"), { group: 2, slot: 1 });
    expect(FIRST).toEqual(before);
  });
});

describe("autoFill", () => {
  it("seats by role: a tank and a healer per group, melee from Group 1, ranged from the last", () => {
    expect(groupsOf(autoFill(PLAYERS, {}, 2))).toEqual([
      ["Aldren", "Cael", "Brisa", "Fenn", "Isla"],
      ["Edda", "Gwyn", "Dara", "Hale", "Jory"],
    ]);
  });

  it("never moves anyone already placed", () => {
    expect(groupsOf(autoFill(PLAYERS, FIRST, 2))).toEqual([
      ["Aldren", "Brisa", "Cael", "Fenn", "Isla"],
      ["Edda", "Gwyn", "Dara", "Hale", "Jory"],
    ]);
  });

  it("leaves the rest out once the groups are full, tanks and healers first", () => {
    const filled = autoFill(PLAYERS, {}, 1);
    expect(groupsOf(filled, 1)).toEqual([["Aldren", "Edda", "Cael", "Gwyn", "Brisa"]]);
    expect(names(unplacedOf(PLAYERS, filled))).toEqual(["Dara", "Fenn", "Hale", "Isla", "Jory"]);
  });

  it("spreads a 40-man across its eight groups by role, filling every seat", () => {
    const raid = roster([
      [DISPLAY_ROLE.TANK, 4],
      [DISPLAY_ROLE.HEALER, 10],
      [DISPLAY_ROLE.MELEE, 12],
      [DISPLAY_ROLE.RANGED, 13],
      [null, 1],
    ]);
    const filled = autoFill(raid, {}, 8);
    expect(Object.keys(filled)).toHaveLength(40);
    expect(numbersTo(8).map((group) => tallyShort(roleTally(seatsOf(raid, filled, group))))).toEqual([
      "T1 H2 M2 R0",
      "T1 H2 M2 R0",
      "T1 H1 M3 R0",
      "T1 H1 M3 R0",
      "T0 H1 M2 R1",
      "T0 H1 M0 R4",
      "T0 H1 M0 R4",
      "T0 H1 M0 R4",
    ]);
  });
});

describe("what leaves the planner", () => {
  it("saves every placed player in group and seat order, with the version and the sharing", () => {
    const placements = {
      [idOf("Edda")]: { group: 2, slot: 1 },
      [idOf("Cael")]: { group: 1, slot: 3 },
      [idOf("Aldren")]: { group: 1, slot: 1 },
    };
    expect(toPayload(3, true, placements)).toEqual({
      version: 3,
      published: true,
      assignments: [
        { signup_id: idOf("Aldren"), group: 1, slot: 1 },
        { signup_id: idOf("Cael"), group: 1, slot: 3 },
        { signup_id: idOf("Edda"), group: 2, slot: 1 },
      ],
    });
    expect(toPayload(1, false, {})).toEqual({ version: 1, published: false, assignments: [] });
  });

  it("copies a line per group with anyone in it", () => {
    expect(asText(PLAYERS, FIRST, 2)).toBe("G1: Aldren, Brisa, Cael\nG2: Edda, Gwyn");
    expect(asText(PLAYERS, { [idOf("Hale")]: { group: 2, slot: 4 } }, 2)).toBe("G2: Hale");
    expect(asText(PLAYERS, {}, 2)).toBe("");
  });

  it("tells a change from none", () => {
    expect(samePlacements(FIRST, { ...FIRST })).toBe(true);
    expect(samePlacements(FIRST, swapOrPlace(FIRST, idOf("Fenn"), { group: 1, slot: 4 }))).toBe(false);
    expect(samePlacements(FIRST, swapOrPlace(FIRST, idOf("Gwyn"), { group: 2, slot: 5 }))).toBe(false);
  });
});
