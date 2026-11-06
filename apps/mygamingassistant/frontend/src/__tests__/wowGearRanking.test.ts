import { describe, expect, it } from "vitest";
import { CLOSE_SCORE_PCT, PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import { decodeGearData } from "@/games/wow-forever/gear/decodeGearData";
import { availableFrom, craftLevel, isAvailabilityEstimated } from "@/games/wow-forever/gear/gearAvailability";
import { canEquip, groupUsable } from "@/games/wow-forever/gear/gearFilters";
import { gearHeading } from "@/games/wow-forever/gear/gearHeading";
import { describeSource, pctLabel, sourceChipKind } from "@/games/wow-forever/gear/gearSourceText";
import { rankLeveling, rankPreRaid } from "@/games/wow-forever/gear/rankGear";
import { DEFAULT_GEAR_SETTINGS, parseGearSettings } from "@/games/wow-forever/hooks/useGearSettings";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearFactsFile } from "@/games/wow-forever/types/gearFactsFile";
import type { GearSettings } from "@/games/wow-forever/types/gearSettings";
import type { GearSourcesFile } from "@/games/wow-forever/types/gearSourcesFile";

function item(id: number, patch: Partial<ClientItem>): ClientItem {
  return {
    id,
    name: `Item ${id}`,
    quality: "rare",
    slot: "neck",
    itemType: null,
    itemLevel: 60,
    requiredLevel: 0,
    armor: null,
    weapon: null,
    stats: {},
    classes: null,
    damageUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...patch,
  };
}

const FACTS: GearFactsFile = {
  clientBuild: "1.60.1.70790",
  eraLeftovers: [],
  deprecated: [],
  crafted: {},
  requires: {},
  reputation: {},
  pvp: {},
  bindOnPickup: {},
};

const SOURCES: GearSourcesFile = { dungeons: {}, raidOnly: [], pvp: [], quests: {}, drops: {} };

function data(facts: Partial<GearFactsFile> = {}, sources: Partial<GearSourcesFile> = {}) {
  return decodeGearData({ ...FACTS, ...facts }, { ...SOURCES, ...sources });
}

const QUEST = (title: string, minLevel: number, side = "N", classes = "") =>
  [title, minLevel, minLevel + 2, side, classes] as const;

const PRE_RAID: GearSettings = { ...DEFAULT_GEAR_SETTINGS, view: "preraid" };

function slot(ranking: ReturnType<typeof rankPreRaid>, id: string) {
  const found = ranking.slots.find((s) => s.group.id === id);
  if (!found) throw new Error(`no ${id} card`);
  return found;
}

describe("close scores: a known source wins unless the unknown one is more than CLOSE_SCORE_PCT higher", () => {
  it("is 3 percent", () => {
    expect(CLOSE_SCORE_PCT).toBe(3);
  });

  it("puts the known item first at 102 vs 100", () => {
    const items = [item(1, { stats: { spell_damage: 102 } }), item(2, { stats: { spell_damage: 100 } })];
    const neck = slot(rankPreRaid(items, data({}, { quests: { "2": [QUEST("Known", 50)] } }), PRE_RAID), "neck");
    expect(neck.top.map((r) => r.item.id)).toEqual([2, 1]);
    expect(neck.top[1].pctOfBest).toBe(102);
  });

  it("puts the unknown item first at 104 vs 100", () => {
    const items = [item(1, { stats: { spell_damage: 104 } }), item(2, { stats: { spell_damage: 100 } })];
    const neck = slot(rankPreRaid(items, data({}, { quests: { "2": [QUEST("Known", 50)] } }), PRE_RAID), "neck");
    expect(neck.top.map((r) => r.item.id)).toEqual([1, 2]);
  });

  it("orders two known items by score alone", () => {
    const items = [item(1, { stats: { spell_damage: 101 } }), item(2, { stats: { spell_damage: 100 } })];
    const quests = { "1": [QUEST("A", 50)], "2": [QUEST("B", 50)] };
    expect(slot(rankPreRaid(items, data({}, { quests }), PRE_RAID), "neck").top.map((r) => r.item.id)).toEqual([1, 2]);
  });
});

describe("rankPreRaid", () => {
  it("lists the top 3 and leaves out unobtainable, PvP, random-suffix and other-class items", () => {
    const items = [
      item(1, { stats: { spell_damage: 10 } }),
      item(2, { stats: { spell_damage: 20 } }),
      item(3, { stats: { spell_damage: 30 } }),
      item(4, { stats: { spell_damage: 40 } }),
      item(5, { stats: { spell_damage: 99 } }), // raid only
      item(6, { stats: { spell_damage: 98 } }), // deprecated
      item(7, { stats: { spell_damage: 97 } }), // PvP (Forever client)
      item(8, { stats: { spell_damage: 96 } }), // PvP (Classic vendor)
      item(9, { stats: { spell_damage: 95 }, randomSuffix: true }),
      item(10, { stats: { spell_damage: 94 }, classes: ["mage"] }),
      item(11, { stats: { strength: 50 } }), // scores nothing for a Warlock
    ];
    const gear = data({ deprecated: [6], pvp: { "7": 1 } }, { raidOnly: [5], pvp: [8] });
    const neck = slot(rankPreRaid(items, gear, PRE_RAID), "neck");
    expect(neck.top.map((r) => r.item.id)).toEqual([4, 3, 2]);
    const withPvp = slot(rankPreRaid(items, gear, { ...PRE_RAID, includePvp: true }), "neck");
    expect(withPvp.top.map((r) => r.item.id)).toEqual([7, 8, 4]);
  });

  it("keeps level 60 epics with no known source apart (they may be raid loot)", () => {
    const items = [
      item(1, { quality: "epic", requiredLevel: 60, stats: { spell_damage: 50 } }),
      item(2, { stats: { spell_damage: 40 } }),
    ];
    const neck = slot(rankPreRaid(items, data(), PRE_RAID), "neck");
    expect(neck.top.map((r) => r.item.id)).toEqual([2]);
    expect(neck.unknownEpics.map((r) => r.item.id)).toEqual([1]);
    expect(neck.unknownEpics[0].pctOfBest).toBe(125);
  });

  it("hides quests the other faction or another class takes, keeps items with another source", () => {
    const items = [
      item(1, { stats: { spell_damage: 50 } }),
      item(2, { stats: { spell_damage: 40 } }),
      item(3, { stats: { spell_damage: 30 } }),
    ];
    const gear = data(
      { crafted: { "2": ["Tailoring", 250] } },
      { quests: { "1": [QUEST("Horde only", 50, "H")], "2": [QUEST("Horde too", 50, "H")], "3": [QUEST("Mages", 50, "N", "mage")] } },
    );
    const neck = slot(rankPreRaid(items, gear, PRE_RAID), "neck");
    expect(neck.top.map((r) => r.item.id)).toEqual([2]);
    expect(neck.top[0].sources.map((s) => s.kind)).toEqual(["crafted"]);
    const horde = slot(rankPreRaid(items, gear, { ...PRE_RAID, faction: "H" }), "neck");
    expect(horde.top.map((r) => r.item.id)).toEqual([1, 2]);
  });

  it("has a card per slot the class fills (no two-hand-less gaps for a Warlock)", () => {
    const cards = rankPreRaid([], data(), PRE_RAID).slots.map((s) => s.group.id);
    expect(cards).toEqual(GEAR_SLOT_GROUPS.filter((g) => groupUsable(g, "warlock")).map((g) => g.id));
    expect(cards).toContain("ranged");
  });
});

describe("rankLeveling", () => {
  const settings: GearSettings = { ...DEFAULT_GEAR_SETTINGS, level: 20 };

  it("lists what you can wear now and the first better item later", () => {
    const items = [
      item(1, { requiredLevel: 15, stats: { intellect: 5 } }),
      item(2, { requiredLevel: 25, stats: { intellect: 8 } }),
      item(3, { requiredLevel: 30, stats: { intellect: 20 } }),
      // req 0, no sources → estimate from ilvl (60 − 5 = 55); left out of "now" at level 20
      item(4, { requiredLevel: 0, stats: { intellect: 50 } }),
    ];
    const ranking = rankLeveling(items, data(), settings, 20);
    const neck = slot(ranking, "neck");
    expect(neck.top.map((r) => r.item.id)).toEqual([1]);
    // Item 2 (req 25) is the soonest better item (before 3 at 30, 4 at 55).
    expect(neck.nextUpgrade?.item.id).toBe(2);
    expect(neck.nextUpgrade?.availableFrom).toBe(25);
    expect(neck.nextUpgrade?.pctOfBest).toBe(160);
    // All items now have an estimated or stated level — nothing left out.
    expect(ranking.unknownLevelCount).toBe(0);
  });

  it("waits for a quest's level when the item has none", () => {
    const items = [item(1, { stats: { intellect: 5 } })];
    const gear = data({}, { quests: { "1": [QUEST("Later", 24)] } });
    expect(slot(rankLeveling(items, gear, settings, 20), "neck").nextUpgrade?.availableFrom).toBe(24);
    expect(slot(rankLeveling(items, gear, settings, 24), "neck").top.map((r) => r.item.id)).toEqual([1]);
  });

  it("estimates the available level for req ≤ 1 items with no sources (ilvl − 5)", () => {
    // ilvl 43, req 1, no sources → estimated = Math.max(1, 43-5) = 38
    // This is the Discarded Circlet pattern: the client shows req 1 but it's
    // a quest reward obtainable around level 38 based on ilvl.
    const items = [
      item(1, { requiredLevel: 15, stats: { intellect: 5 } }), // wearable at 20
      item(2, { requiredLevel: 1, itemLevel: 43, stats: { intellect: 8 } }), // estimated 38
    ];
    const ranking = rankLeveling(items, data(), settings, 20);
    const neck = slot(ranking, "neck");
    // Item 2 must NOT appear in top at level 20 (estimated available from 38).
    expect(neck.top.map((r) => r.item.id)).toEqual([1]);
    expect(neck.nextUpgrade?.item.id).toBe(2);
    expect(neck.nextUpgrade?.availableFrom).toBe(38);
    expect(neck.nextUpgrade?.availableFromEstimated).toBe(true);
    // At level 38, item 2 becomes wearable (item 1 req 15 is also wearable).
    const atLevel38 = slot(rankLeveling(items, data(), { ...settings, level: 38 }, 38), "neck");
    expect(atLevel38.top[0].item.id).toBe(2); // item 2 leads (intellect 8 > 5)
  });

  it("still excludes items that have sources but none saying a level (Apprentice craft, unlisted drop)", () => {
    const unlisted = { kind: "drop", boss: "Somebody", dungeon: null } as const;
    // sources.length > 0 → estimate not applied → availableFrom stays null
    expect(availableFrom(item(1, { requiredLevel: 0 }), [unlisted])).toBeNull();
    expect(isAvailabilityEstimated(item(1, { requiredLevel: 0 }), [unlisted])).toBe(false);
  });
});

describe("proficiencies", () => {
  const neck = GEAR_SLOT_GROUPS.find((g) => g.id === "neck")!;
  const chest = GEAR_SLOT_GROUPS.find((g) => g.id === "chest")!;
  const offHand = GEAR_SLOT_GROUPS.find((g) => g.id === "off_hand")!;
  const twoHand = GEAR_SLOT_GROUPS.find((g) => g.id === "two_hand")!;

  it("keeps a Warlock in cloth", () => {
    expect(canEquip(item(1, { slot: "chest", itemType: "Cloth" }), chest, "warlock", 60)).toBe(true);
    expect(canEquip(item(1, { slot: "chest", itemType: "Leather" }), chest, "warlock", 60)).toBe(false);
  });

  it("gives Mail to a Hunter at 40", () => {
    const mail = item(1, { slot: "chest", itemType: "Mail" });
    expect(canEquip(mail, chest, "hunter", 39)).toBe(false);
    expect(canEquip(mail, chest, "hunter", 40)).toBe(true);
  });

  it("lets a Warrior dual wield from 20 and a Rogue from 1, never a Mage; shields need the class", () => {
    const dagger = item(1, { slot: "one_hand", itemType: "Dagger" });
    expect(canEquip(dagger, offHand, "warrior", 19)).toBe(false);
    expect(canEquip(dagger, offHand, "warrior", 20)).toBe(true);
    expect(canEquip(dagger, offHand, "rogue", 1)).toBe(true);
    expect(canEquip(dagger, offHand, "mage", 60)).toBe(false);
    const shield = item(2, { slot: "off_hand", itemType: "Shield" });
    expect(canEquip(shield, offHand, "warrior", 60)).toBe(true);
    expect(canEquip(shield, offHand, "warlock", 60)).toBe(false);
    expect(canEquip(item(3, { slot: "held_in_off_hand" }), offHand, "warlock", 60)).toBe(true);
  });

  it("only uses rings in the ring card", () => {
    expect(canEquip(item(1, { slot: "finger" }), neck, "warlock", 60)).toBe(false);
  });

  it("has no two-hand card for a Rogue", () => {
    expect(groupUsable(twoHand, "rogue")).toBe(false);
    expect(groupUsable(twoHand, "warlock")).toBe(true);
  });
});

describe("availability", () => {
  it("dates crafted gear by the profession rank that teaches it", () => {
    expect(craftLevel("Tailoring", 50)).toBeNull();
    expect(craftLevel("Tailoring", 100)).toBe(10);
    expect(craftLevel("Tailoring", 160)).toBe(20);
    expect(craftLevel("Engineering", 270)).toBe(35);
    expect(craftLevel("Cooking", 270)).toBeNull();
  });

  it("never lets a source with no level pull an item down to level 1", () => {
    const apprentice = { kind: "crafted", profession: "Tailoring", skill: 40 } as const;
    const quest = { kind: "quest", title: "Q", minLevel: 22, questLevel: 24, side: "N", classes: [] } as const;
    const unlisted = { kind: "drop", boss: "Somebody", dungeon: null } as const;
    expect(availableFrom(item(1, { requiredLevel: 0 }), [apprentice, quest, unlisted])).toBe(22);
    // sources exist but none supply a level → may be from level 1; don't estimate
    expect(availableFrom(item(1, { requiredLevel: 0 }), [apprentice, unlisted])).toBeNull();
    expect(availableFrom(item(1, { requiredLevel: 18 }), [apprentice])).toBe(18);
  });

  it("raises the required level to the earliest source", () => {
    const crafted = { kind: "crafted", profession: "Tailoring", skill: 270 } as const;
    expect(availableFrom(item(1, { requiredLevel: 20 }), [crafted])).toBe(35);
    expect(availableFrom(item(1, { requiredLevel: 50 }), [crafted])).toBe(50);
    // req 0, no sources at all → estimate from ilvl (default ilvl=60 → 60-5=55)
    expect(availableFrom(item(1, { requiredLevel: 0 }), [])).toBe(55);
    // req 1, no sources → estimate from ilvl (default ilvl=60 → 55)
    expect(availableFrom(item(1, { requiredLevel: 1 }), [])).toBe(55);
    // req > 1 with no sources → stated level only (unchanged)
    expect(availableFrom(item(1, { requiredLevel: 7 }), [])).toBe(7);
  });

  it("estimates from ilvl exactly (ilvl − 5, min 1) for req ≤ 1 items with no sources", () => {
    // Evidence: n=2194 items in items.json with ilvl 30–70 and req > 1,
    // median gap = 5, p10 = p25 = p75 = p90 = 5 for uncommon, rare and epic.
    expect(availableFrom(item(1, { requiredLevel: 0, itemLevel: 43 }), [])).toBe(38);
    expect(availableFrom(item(1, { requiredLevel: 1, itemLevel: 43 }), [])).toBe(38);
    expect(availableFrom(item(1, { requiredLevel: 0, itemLevel: 54 }), [])).toBe(49);
    expect(availableFrom(item(1, { requiredLevel: 0, itemLevel: 61 }), [])).toBe(56);
    // ilvl ≤ 6 clamps to 1
    expect(availableFrom(item(1, { requiredLevel: 0, itemLevel: 5 }), [])).toBe(1);
    expect(isAvailabilityEstimated(item(1, { requiredLevel: 0 }), [])).toBe(true);
    expect(isAvailabilityEstimated(item(1, { requiredLevel: 1 }), [])).toBe(true);
    expect(isAvailabilityEstimated(item(1, { requiredLevel: 2 }), [])).toBe(false);
    const unlisted = { kind: "drop", boss: "X", dungeon: null } as const;
    expect(isAvailabilityEstimated(item(1, { requiredLevel: 0 }), [unlisted])).toBe(false);
  });
});

describe("source labels", () => {
  it("labels game files, Classic data and unknown", () => {
    const gear = data(
      { crafted: { "1": ["Tailoring", 275] } },
      {
        quests: { "1": [QUEST("Q", 40)] },
        drops: { "2": [["Edwin VanCleef", 36]] },
        dungeons: { "36": ["The Deadmines", 24, 10] },
      },
    );
    const one = gear.sources.get(1) ?? [];
    const two = gear.sources.get(2) ?? [];
    expect(sourceChipKind(one)).toBe("crafted");
    expect(one.map(describeSource)).toEqual(["Tailoring 275", "Quest: Q (from level 40)"]);
    expect(sourceChipKind(two)).toBe("drop");
    expect(describeSource(two[0])).toBe("Edwin VanCleef, The Deadmines (levels 10–24)");
    expect(sourceChipKind([])).toBe("unknown");
  });

  it("pctLabel: standard labels", () => {
    expect(pctLabel(100, true)).toBe("Top pick");
    expect(pctLabel(91.6, false)).toBe("92% of top pick");
  });

  it("pctLabel: close rule — top pick says known source, second says scores higher", () => {
    // Top pick won because of the close rule (a no-source item scored more).
    expect(pctLabel(100, true, true)).toBe("Top pick · known source");
    // The second item: pctOfBest = 102 (scored 2% higher than the top pick).
    expect(pctLabel(102, false)).toBe("Scores 102% of top pick — source unknown");
    // pctOfBest exactly at 100 is still normal (tied or genuinely lower).
    expect(pctLabel(100, false)).toBe("100% of top pick");
  });
});

describe("settings", () => {
  it("defaults to Warlock and fixes a spec that isn't the class's", () => {
    expect(DEFAULT_GEAR_SETTINGS.classId).toBe("warlock");
    const parsed = parseGearSettings({ classId: "mage", specId: "affliction", level: "61", view: "nope" }, DEFAULT_GEAR_SETTINGS);
    expect(parsed.classId).toBe("mage");
    expect(parsed.specId).toBe("arcane");
    expect(parsed.level).toBeNull();
    expect(parsed.view).toBe("leveling");
  });

  it("keeps a valid Warlock spec and says who the list is for", () => {
    const parsed = parseGearSettings({ specId: "destruction", level: "42", faction: "H", includePvp: "1" }, DEFAULT_GEAR_SETTINGS);
    expect(parsed).toMatchObject({ classId: "warlock", specId: "destruction", level: 42, faction: "H", includePvp: true });
    expect(gearHeading(parsed, PRE_RAID_LEVEL, false)).toBe("Best gear for a level 60 Destruction Warlock (Horde).");
    // Leveling scores one way per class, so the spec isn't claimed.
    expect(gearHeading(parsed, 42, true)).toBe("Best gear for a level 42 Warlock (Horde).");
  });
});
