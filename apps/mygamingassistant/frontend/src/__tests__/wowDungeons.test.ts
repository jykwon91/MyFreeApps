import { describe, expect, it } from "vitest";
import { DUNGEON_LIST_SKELETON_ROWS } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { decodeDungeons, findDungeon } from "@/games/wow-forever/lib/dungeons/decodeDungeons";
import {
  bossCountText,
  chanceText,
  doorLabel,
  entranceZonesText,
  entryText,
  groupSizeText,
  lootKindText,
} from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { bossAnchorId, bossHref, dungeonPageHref, worldMapZoneHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import { dungeonSlug, uniqueSlugs } from "@/games/wow-forever/lib/dungeons/dungeonSlug";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { nearestFlightPaths } from "@/games/wow-forever/lib/dungeons/nearestFlightPaths";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";
import type { DungeonWorld } from "@/games/wow-forever/types/dungeons/dungeonWorld";
import type { FlightNode, WorldZone } from "@/games/wow-forever/types/worldMap";

const DUNGEON_COLUMNS = ["trigger", "instance", "name", "wing", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "subzone", "x", "y", "z"];

function fixture(): DungeonDataFiles {
  return {
    dungeons: {
      columns: DUNGEON_COLUMNS,
      rows: [
        [1, 10, "Test Keep", "", "dungeon", 20, 20, 15, 100, "Old Hill", 50, 50, 1],
        [2, 10, "Test Keep", "Back door", "dungeon", 22, 22, 18, 200, "Far Gulch", 10, 20, 1],
        [3, 11, "Big Raid", "", "raid", 60, 60, 50, 100, "", 1, 1, 1],
        [4, 12, "Twin Halls", "East", "dungeon", 30, 30, 25, 100, "", 40, 60, 1],
        [5, 12, "Twin Halls", "East, back door", "dungeon", 30, 30, 25, 100, "Lower Wilds", 41, 61, 1],
      ],
    },
    interiors: {
      entranceColumns: ["trigger", "x", "y", "z"],
      bossColumns: ["encounter", "name", "x", "y", "z", "spots"],
      doorColumns: ["x", "y", "z", "key"],
      instances: {
        "10": {
          entrances: [],
          bosses: [
            [501, "Guard Captain", 0, 0, 0, 1],
            [502, "Guard Captain", null, null, null, 0],
            [503, "The Lord", 0, 0, 0, 1],
          ],
          doors: [[0, 0, 0, "Iron Key"], [5, 5, 0, "Iron Key"], [9, 9, 0, "Tower Key"]],
        },
      },
    },
    bossLoot: {
      lootColumns: ["item", "chance"],
      instances: { "10": { "501": [[9001, 45], [9999, 30]], "502": [] } },
    },
    lootItems: {
      clientBuild: "1.2.3.4",
      columns: ["name", "slot", "itemType"],
      items: { "9001": ["Captain's Blade", "one_hand", "Sword"] },
    },
    facts: { maxPlayers: { "10": 5 } },
    entry: { columns: ["trigger", "item", "quest"], instances: { "12": [[4, 7001, 0]] } },
  };
}

function zone(id: number, name: string, continent: number): WorldZone {
  return { id, name, kind: "zone", continent, parent: 0, bounds: [0, 1000, 0, 1000] };
}

function node(id: number, name: string, continent: number, faction: FlightNode["faction"], wx: number, wy: number): FlightNode {
  return { id, name, continent, world: { continent, wx, wy }, faction, zone: 100, subzone: "", x: 0, y: 0 };
}

/** Test Keep's main door (50, 50) on Hillshire is world (500, 500). */
const WORLD: DungeonWorld = {
  zones: [zone(100, "Hillshire", 0), zone(200, "Gulchland", 1)],
  flightNodes: [
    node(1, "Near Alliance", 0, "A", 500, 600),
    node(2, "Far Alliance", 0, "A", 500, 900),
    node(3, "Neutral Post", 0, "N", 500, 300),
    node(4, "Other Continent Horde", 1, "H", 500, 500),
  ],
};

describe("decodeDungeons", () => {
  const data = decodeDungeons(fixture(), WORLD);

  it("keeps dungeons only, one per instance, in the file's order", () => {
    expect(data.dungeons.map((d) => d.name)).toEqual(["Test Keep", "Twin Halls"]);
    expect(data.clientBuild).toBe("1.2.3.4");
  });

  it("spans every entrance's level and opens at the lowest required level", () => {
    const keep = data.dungeons[0];
    expect([keep.levelMin, keep.levelMax, keep.requiredLevel]).toEqual([20, 22, 15]);
  });

  it("groups entrances by zone, with zone names, each door and the nearest flight path per faction", () => {
    expect(data.dungeons[0].entrances).toEqual([
      {
        zoneId: 100,
        zoneName: "Hillshire",
        subzone: "Old Hill",
        doors: [{ trigger: 1, wing: "", x: 50, y: 50 }],
        flightPaths: [
          { faction: "A", name: "Near Alliance", yards: 100 },
          { faction: "H", name: "Neutral Post", yards: 200 },
        ],
      },
      {
        zoneId: 200,
        zoneName: "Gulchland",
        subzone: "Far Gulch",
        doors: [{ trigger: 2, wing: "Back door", x: 10, y: 20 }],
        flightPaths: [{ faction: "H", name: "Other Continent Horde", yards: expect.any(Number) }],
      },
    ]);
    expect(data.dungeons[1].entrances[0].doors.map((d) => d.wing)).toEqual(["East", "East, back door"]);
    expect(data.dungeons[1].entrances[0].subzone).toBe("Lower Wilds");
  });

  it("carries group size, entry requirements and the keys locked doors take", () => {
    const [keep, halls] = data.dungeons;
    expect(keep.maxPlayers).toBe(5);
    expect(halls.maxPlayers).toBeNull();
    expect(keep.entryRequirements).toEqual([]);
    expect(halls.entryRequirements).toEqual([{ trigger: 4, itemId: 7001, questId: 0 }]);
    expect(keep.lockedDoorKeys).toEqual(["Iron Key", "Tower Key"]);
    expect(halls.lockedDoorKeys).toEqual([]);
    expect(keep.interior?.mapId).toBe(10);
    expect(halls.interior).toBeNull();
  });

  it("lists bosses in the interiors' order, with unique slugs", () => {
    expect(data.dungeons[0].bosses.map((b) => [b.encounter, b.slug])).toEqual([
      [501, "guard-captain"],
      [502, "guard-captain-2"],
      [503, "the-lord"],
    ]);
  });

  it("joins loot to its names; unknown items drop, an empty list stays empty, no entry is null", () => {
    const [first, second, third] = data.dungeons[0].bosses;
    expect(first.loot).toEqual([{ id: 9001, name: "Captain's Blade", slot: "one_hand", itemType: "Sword", chance: 45 }]);
    expect(second.loot).toEqual([]);
    expect(third.loot).toBeNull();
  });

  it("gives a dungeon with no interior no bosses", () => {
    expect(data.dungeons[1].bosses).toEqual([]);
  });

  it("throws on a missing column", () => {
    const files = fixture();
    files.lootItems.columns = ["name", "slot"];
    expect(() => decodeDungeons(files, WORLD)).toThrow(/itemType/);
  });

  it("leaves out flight paths on another continent, and a zone it can't place", () => {
    expect(nearestFlightPaths({ continent: 0, wx: 0, wy: 0 }, [node(9, "Away", 1, "A", 0, 0)])).toEqual([]);
    const lost = decodeDungeons(fixture(), { zones: [], flightNodes: WORLD.flightNodes });
    expect(lost.dungeons[0].entrances[0]).toMatchObject({ zoneName: "", flightPaths: [] });
  });

  it("finds a dungeon by slug", () => {
    expect(findDungeon(data, "twin-halls")?.instanceId).toBe(12);
    expect(findDungeon(data, "nope")).toBeNull();
    expect(findDungeon(data, undefined)).toBeNull();
  });
});

describe("the committed dungeon data", () => {
  it("decodes every Classic dungeon with unique slugs and real bosses and loot", async () => {
    const data = await loadDungeons();
    expect(data.dungeons).toHaveLength(DUNGEON_LIST_SKELETON_ROWS);
    expect(new Set(data.dungeons.map((d) => d.slug)).size).toBe(data.dungeons.length);
    const deadmines = findDungeon(data, "deadmines");
    expect(deadmines?.entrances.map((e) => e.zoneId)).toEqual([1436]);
    expect(deadmines?.maxPlayers).toBe(10);
    expect(deadmines?.entrances[0].flightPaths.find((f) => f.faction === "A")?.name).toBe("Sentinel Hill, Westfall");
    const sm = findDungeon(data, "scarlet-monastery");
    expect(sm?.lockedDoorKeys).toContain("The Scarlet Key");
    expect(sm?.entrances.flatMap((e) => e.doors).length).toBeGreaterThan(1);
    const lastBoss = deadmines?.bosses[deadmines.bosses.length - 1];
    expect(lastBoss?.slug).toBe("edwin-vancleef");
    expect(lastBoss?.loot?.some((l) => l.id === 5193)).toBe(true);
    for (const d of data.dungeons) {
      expect(d.entrances.every((e) => e.zoneName !== "" && e.doors.length > 0)).toBe(true);
      expect(d.entryRequirements).toEqual([]);
      for (const b of d.bosses) {
        for (const l of b.loot ?? []) {
          expect(l.name).not.toBe("");
          expect(l.chance).toBeGreaterThan(0);
        }
      }
    }
    expect(data.dungeons.some((d) => d.name === "Molten Core")).toBe(false);
  });
});

describe("dungeon slugs and links", () => {
  it("slugs names", () => {
    expect(dungeonSlug("Zul'Farrak")).toBe("zulfarrak");
    expect(dungeonSlug("Mr. Smite")).toBe("mr-smite");
    expect(dungeonSlug('Eric "The Swift"')).toBe("eric-the-swift");
    expect(dungeonSlug("Rhahk'Zor")).toBe("rhahkzor");
    expect(uniqueSlugs(["A", "B", "A", "A"])).toEqual(["a", "b", "a-2", "a-3"]);
  });

  it("builds page, boss and map links", () => {
    expect(dungeonPageHref("deadmines")).toBe("/wow-forever/dungeons/deadmines");
    expect(bossAnchorId("sneed")).toBe("boss-sneed");
    expect(bossHref("deadmines", "sneed")).toBe("/wow-forever/dungeons/deadmines#boss-sneed");
    expect(worldMapZoneHref(1436)).toBe("/wow-forever/map?m=1436");
  });
});

describe("dungeon text", () => {
  it("formats chances, kinds and counts", () => {
    expect(chanceText(45)).toBe("45%");
    expect(chanceText(33.333)).toBe("33.3%");
    expect(lootKindText({ slot: "two_hand", itemType: "Axe" })).toBe("Two-Hand, Axe");
    expect(lootKindText({ slot: null, itemType: "Recipe" })).toBe("Recipe");
    expect(lootKindText({ slot: null, itemType: null })).toBe("");
    expect(bossCountText(1)).toBe("1 boss");
    expect(bossCountText(8)).toBe("8 bosses");
  });

  it("describes doors, group size, entry and zones", () => {
    expect(doorLabel({ wing: "" })).toBe("Entrance");
    expect(doorLabel({ wing: "Armory" })).toBe("Armory");
    expect(groupSizeText(10)).toBe("Up to 10 players");
    expect(entryText([])).toBe("None. Only the level.");
    expect(entryText([{ trigger: 1, itemId: 2, questId: 0 }])).toMatch(/item or a finished quest/);
    const zone = (zoneName: string) => ({ zoneId: 1, zoneName, subzone: "", doors: [], flightPaths: [] });
    expect(entranceZonesText([zone("Westfall")])).toBe("Westfall");
    expect(entranceZonesText([zone("Badlands"), zone("Searing Gorge")])).toBe("Badlands and Searing Gorge");
    expect(entranceZonesText([zone("A"), zone("B"), zone("C")])).toBe("A, B and C");
  });
});
