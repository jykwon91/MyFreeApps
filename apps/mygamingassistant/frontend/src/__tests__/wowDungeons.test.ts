import { describe, expect, it } from "vitest";
import { DUNGEON_LIST_SKELETON_ROWS } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { decodeDungeons, findDungeon } from "@/games/wow-forever/lib/dungeons/decodeDungeons";
import {
  bossCountText,
  chanceText,
  entranceDoorsText,
  entranceZonesText,
  lootKindText,
} from "@/games/wow-forever/lib/dungeons/describeDungeon";
import { bossAnchorId, bossHref, dungeonPageHref, worldMapZoneHref } from "@/games/wow-forever/lib/dungeons/dungeonHref";
import { dungeonSlug, uniqueSlugs } from "@/games/wow-forever/lib/dungeons/dungeonSlug";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import type { DungeonDataFiles } from "@/games/wow-forever/types/dungeons/dungeonDataFiles";

const DUNGEON_COLUMNS = ["trigger", "instance", "name", "wing", "type", "minLevel", "maxLevel", "requiredLevel", "zone", "subzone", "x", "y", "z"];

function fixture(): DungeonDataFiles {
  return {
    dungeons: {
      columns: DUNGEON_COLUMNS,
      rows: [
        [1, 10, "Test Keep", "", "dungeon", 20, 20, 15, 100, "Old Hill", 1, 1, 1],
        [2, 10, "Test Keep", "Back door", "dungeon", 22, 22, 18, 200, "Far Gulch", 1, 1, 1],
        [3, 11, "Big Raid", "", "raid", 60, 60, 50, 100, "", 1, 1, 1],
        [4, 12, "Twin Halls", "East", "dungeon", 30, 30, 25, 100, "", 1, 1, 1],
        [5, 12, "Twin Halls", "East, back door", "dungeon", 30, 30, 25, 100, "Lower Wilds", 1, 1, 1],
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
          doors: [],
        },
      },
    },
    zones: { zones: [{ id: 100, name: "Hillshire" }, { id: 200, name: "Gulchland" }] },
    bossLoot: {
      lootColumns: ["item", "chance"],
      instances: { "10": { "501": [[9001, 45], [9999, 30]], "502": [] } },
    },
    lootItems: {
      clientBuild: "1.2.3.4",
      columns: ["name", "slot", "itemType"],
      items: { "9001": ["Captain's Blade", "one_hand", "Sword"] },
    },
  };
}

describe("decodeDungeons", () => {
  const data = decodeDungeons(fixture());

  it("keeps dungeons only, one per instance, in the file's order", () => {
    expect(data.dungeons.map((d) => d.name)).toEqual(["Test Keep", "Twin Halls"]);
    expect(data.clientBuild).toBe("1.2.3.4");
  });

  it("spans every entrance's level and opens at the lowest required level", () => {
    const keep = data.dungeons[0];
    expect([keep.levelMin, keep.levelMax, keep.requiredLevel]).toEqual([20, 22, 15]);
  });

  it("groups entrances by zone, with zone names, doors and the sub-zone", () => {
    expect(data.dungeons[0].entrances).toEqual([
      { zoneId: 100, zoneName: "Hillshire", wings: [], subzone: "Old Hill" },
      { zoneId: 200, zoneName: "Gulchland", wings: ["Back door"], subzone: "Far Gulch" },
    ]);
    expect(data.dungeons[1].entrances).toEqual([
      { zoneId: 100, zoneName: "Hillshire", wings: ["East", "East, back door"], subzone: "Lower Wilds" },
    ]);
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
    expect(() => decodeDungeons(files)).toThrow(/itemType/);
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
    const lastBoss = deadmines?.bosses[deadmines.bosses.length - 1];
    expect(lastBoss?.slug).toBe("edwin-vancleef");
    expect(lastBoss?.loot?.some((l) => l.id === 5193)).toBe(true);
    for (const d of data.dungeons) {
      expect(d.entrances.every((e) => e.zoneName !== "")).toBe(true);
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

  it("describes doors and zones", () => {
    expect(entranceDoorsText({ zoneId: 1, zoneName: "A", wings: [], subzone: "" })).toBe("");
    expect(entranceDoorsText({ zoneId: 1, zoneName: "A", wings: ["Back door"], subzone: "" })).toBe("Door: Back door");
    expect(entranceDoorsText({ zoneId: 1, zoneName: "A", wings: ["Armory", "Library"], subzone: "" })).toBe(
      "Doors: Armory · Library",
    );
    const zone = (zoneName: string) => ({ zoneId: 1, zoneName, wings: [], subzone: "" });
    expect(entranceZonesText([zone("Westfall")])).toBe("Westfall");
    expect(entranceZonesText([zone("Badlands"), zone("Searing Gorge")])).toBe("Badlands and Searing Gorge");
    expect(entranceZonesText([zone("A"), zone("B"), zone("C")])).toBe("A, B and C");
  });
});
