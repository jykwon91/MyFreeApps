import { describe, expect, it } from "vitest";
import { QUEST_SHARING_COPY } from "@/games/wow-forever/data/dungeons/dungeonPageConfig";
import { questSharingText } from "@/games/wow-forever/lib/dungeons/describeQuest";
import { idsDoneWith, idsUndoneWith, questLineStatus } from "@/games/wow-forever/lib/dungeons/questLineProgress";
import { questLines } from "@/games/wow-forever/lib/dungeons/questLines";
import { continentPickupLinks } from "@/games/wow-forever/lib/dungeons/questPickupsMapLinks";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestPickup } from "@/games/wow-forever/types/dungeons/questPickup";
import type { QuestPickupStep } from "@/games/wow-forever/types/dungeons/questPickupStep";
import { FACTION, ZONE_KIND, type Faction, type WorldZone } from "@/games/wow-forever/types/worldMap";
import { decodeMapViewFragment } from "@/games/wow-forever/worldMap/mapViewShare";

const CONTINENT: WorldZone = { id: 1415, name: "Eastern Kingdoms", kind: ZONE_KIND.continent, continent: 0, parent: 947, bounds: [-1000, 1000, -1000, 1000] };
// The top-left quarter of the continent's picture (+X north, +Y west: x% follows -Y, y% follows -X).
const ZONE: WorldZone = { id: 1436, name: "Westfall", kind: ZONE_KIND.zone, continent: 0, parent: 1415, bounds: [0, 1000, 0, 1000] };
const ZONES = [CONTINENT, ZONE];

function giver(name: string, x: number, y: number, insideDungeon = false): QuestGiver {
  return { kind: "npc", id: 1, name, place: { zoneId: ZONE.id, zoneName: ZONE.name, subzone: "", x, y }, insideDungeon };
}

function step(id: number, side: Faction = FACTION.neutral, g: QuestGiver | null = giver(`Giver ${id}`, 10, 20)): QuestPickupStep {
  return { id, title: `Quest ${id}`, level: 18, minLevel: 14, side, giver: g };
}

function pickup(id: number, g: QuestGiver | null): QuestPickup {
  return { id, title: `Quest ${id}`, level: 18, minLevel: 14, giver: g, dungeonQuest: false };
}

type LineQuest = Parameters<typeof questLines>[0][number];

function quest(id: number, before: QuestPickupStep[], extra: Partial<LineQuest> = {}): LineQuest {
  return { id, title: `Dungeon ${id}`, level: 20, minLevel: 15, side: FACTION.neutral, classes: [], givers: [giver(`Giver ${id}`, 50, 50)], pickupSteps: before, ...extra };
}

describe("questLines", () => {
  it("lists each dungeon quest's earlier quests in order, then the quest itself", () => {
    const [line] = questLines([quest(10, [step(1), step(2)])], FACTION.alliance);
    expect(line.steps.map((s) => s.id)).toEqual([1, 2, 10]);
    expect(line.steps.map((s) => s.dungeonQuest)).toEqual([false, false, true]);
    expect(line.titles).toEqual(["Dungeon 10"]);
  });

  it("folds a dungeon quest another line passes through into that line, marked as a dungeon quest", () => {
    const lines = questLines([quest(10, [step(1)]), quest(11, [step(1), step(10)])], FACTION.alliance);
    expect(lines).toHaveLength(1);
    expect(lines[0].steps.map((s) => [s.id, s.dungeonQuest])).toEqual([[1, false], [10, true], [11, true]]);
  });

  it("shares one line between dungeon quests with exactly the same quests before them", () => {
    const lines = questLines([quest(10, [step(1), step(2)]), quest(11, [step(1), step(2)]), quest(12, [step(1)])], FACTION.alliance);
    expect(lines.map((l) => l.titles)).toEqual([["Dungeon 10", "Dungeon 11"], ["Dungeon 12"]]);
    expect(lines[0].steps.map((s) => s.id)).toEqual([1, 2, 10, 11]);
  });

  it("never merges a class quest into an open quest's line, even with the same quests before them", () => {
    const lines = questLines([quest(10, [step(1)]), quest(11, [step(1)], { classes: ["warlock"] })], FACTION.alliance);
    expect(lines.map((l) => [l.titles, l.classes])).toEqual([[["Dungeon 10"], []], [["Dungeon 11"], ["warlock"]]]);
  });

  it("keeps quests that start on their own apart, and leaves out the other faction's quests and steps", () => {
    const lines = questLines(
      [quest(10, []), quest(11, []), quest(12, [], { side: FACTION.horde }), quest(13, [step(3, FACTION.horde), step(4)])],
      FACTION.alliance,
    );
    expect(lines.map((l) => l.steps.map((s) => s.id))).toEqual([[10], [11], [4, 13]]);
  });
});

describe("questLine progress", () => {
  const [line] = questLines([quest(10, [step(1), step(2), step(3)]), quest(11, [step(1), step(2), step(3)])], FACTION.alliance);

  it("says nothing's done, then the next step, then all done", () => {
    expect(questLineStatus(line, new Set())).toEqual({ doneCount: 0, nextIndex: 0 });
    expect(questLineStatus(line, new Set([1, 2]))).toEqual({ doneCount: 2, nextIndex: 2 });
    expect(questLineStatus(line, new Set([1, 2, 3, 11]))).toEqual({ doneCount: 4, nextIndex: 3 });
    expect(questLineStatus(line, new Set([1, 2, 3, 10, 11]))).toEqual({ doneCount: 5, nextIndex: null });
  });

  it("ticking a step ticks those before it; a dungeon quest at the end doesn't tick its neighbour", () => {
    expect(idsDoneWith(line, 2)).toEqual([1, 2, 3]);
    expect(idsDoneWith(line, 4)).toEqual([1, 2, 3, 11]);
  });

  it("unticking a step unticks those after it; a dungeon quest at the end only itself", () => {
    expect(idsUndoneWith(line, 1)).toEqual([2, 3, 10, 11]);
    expect(idsUndoneWith(line, 3)).toEqual([10]);
  });
});

describe("continentPickupLinks", () => {
  it("marks each giver once on the continent map, where it stands in its zone", () => {
    const pickups = [pickup(1, giver("Gryan", 50, 50)), pickup(2, giver("Gryan", 50, 50)), pickup(3, giver("Wiley", 0, 0))];
    const [link] = continentPickupLinks(pickups, ZONES);
    expect(link).toMatchObject({ mapName: "Eastern Kingdoms", count: 2 });
    expect(link.href).toMatch(/^\/wow-forever\/map\?m=1415#/);
    const view = decodeMapViewFragment(link.href.split("#")[1]);
    expect(view?.mapId).toBe(1415);
    // The zone's middle is a quarter across and down the continent; its top-left corner is the continent's.
    expect(view?.marks.marks.map((m) => [m.label, m.x, m.y, m.style])).toEqual([
      ["Gryan", 25, 25, "quest"],
      ["Wiley", 0, 0, "quest"],
    ]);
  });

  it("leaves out givers inside the dungeon or with no place, and gives no link with nothing to mark", () => {
    expect(continentPickupLinks([pickup(1, giver("Inside", 50, 50, true)), pickup(2, null)], ZONES)).toEqual([]);
  });
});

describe("questSharingText", () => {
  const before = { id: 1, title: "The Defias Brotherhood", level: 18, giver: null };

  it("says a party needs the quests before a shareable quest", () => {
    const text = questSharingText({ shareable: true, chain: [before, before] });
    expect(text.badge).toBe("Shareable only if they've done the 2 quests before it");
    expect(text.detail).toContain("The Defias Brotherhood, The Defias Brotherhood");
  });

  it("is plain Shareable / Can't share otherwise", () => {
    expect(questSharingText({ shareable: true, chain: [] })).toBe(QUEST_SHARING_COPY.shareable);
    expect(questSharingText({ shareable: false, chain: [before] })).toBe(QUEST_SHARING_COPY.notShareable);
    expect(questSharingText({ shareable: null, chain: [] } as Pick<DungeonQuest, "shareable" | "chain">)).toBe(QUEST_SHARING_COPY.notShareable);
  });
});
