import { describe, expect, it } from "vitest";
import { ITEM_PAGE_SHARD_COUNT } from "@/games/wow-forever/data/itemPages/itemPageConfig";
import { CLASSIC_ITEM_SHARDS, FOREVER_ITEM_SHARDS } from "@/games/wow-forever/data/itemPages/itemPageShards";
import { craftedLine, craftingGuideHref, reagentsLine } from "@/games/wow-forever/lib/itemPages/craftedText";
import { decodeItemFacts } from "@/games/wow-forever/lib/itemPages/decodeItemFacts";
import {
  bindText,
  instanceDropText,
  instanceLevelText,
  questLevelText,
  weaponDps,
} from "@/games/wow-forever/lib/itemPages/describeItem";
import { backFromState } from "@/games/wow-forever/lib/itemPages/itemPageBack";
import { itemPageHref, parseItemId } from "@/games/wow-forever/lib/itemPages/itemPageHref";
import { loadItemPage } from "@/games/wow-forever/lib/itemPages/itemPageLoader";
import { itemPageShard, shardFileName, shardLoader } from "@/games/wow-forever/lib/itemPages/itemPageShard";
import { ITEM_SOURCE_SECTION, itemSourceSections } from "@/games/wow-forever/lib/itemPages/itemSourceSections";
import { itemStatLines } from "@/games/wow-forever/lib/itemPages/itemStatLines";
import { noSourceText } from "@/games/wow-forever/lib/itemPages/noSourceText";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import type { ItemPage } from "@/games/wow-forever/types/itemPages/itemPage";
import type { ItemPageResult } from "@/games/wow-forever/types/itemPages/itemPageResult";
import { ITEM_PAGE_RESULT } from "@/games/wow-forever/types/itemPages/itemPageResultKind";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";
import { FACTION } from "@/games/wow-forever/types/worldMap";

function found(result: ItemPageResult): ItemPage {
  if (result.kind !== ITEM_PAGE_RESULT.found) throw new Error(`expected a found item, got ${result.kind}`);
  return result.page;
}

const ITEM: ClientItem = {
  id: 2042,
  name: "Staff of Westfall",
  quality: "rare",
  slot: "two_hand",
  itemType: "Staff",
  itemLevel: 24,
  requiredLevel: 19,
  armor: null,
  weapon: { minDamage: 50, maxDamage: 76, speed: 2.9 },
  stats: { spirit: 4, stamina: 9, hit_pct: 1 },
  classes: null,
  damageUnknown: false,
  otherEffects: 0,
  randomSuffix: false,
};

const QUEST: ItemQuest = { id: 1, title: "A Quest", level: 21, side: "A", givers: [], minLevel: 16, classes: "" };

function instanceDrop(kind: "dungeon" | "raid"): InstanceDrop {
  return {
    name: "A Boss",
    minLevel: 59,
    maxLevel: 59,
    chance: 19.8,
    kind: "boss",
    instance: { id: 230, name: "Somewhere", kind, maxLevel: 59, requiredLevel: 52, entrance: null },
  };
}

function page(overrides: Partial<ItemPage["sources"]>, crafted = false): ItemPage {
  return {
    item: ITEM,
    clientBuild: "1",
    facts: {
      bind: null,
      buyPrice: null,
      crafted: crafted
        ? [{ profession: "tailoring", skill: 100, spell: 1, recipe: "R", reagents: [], learn: "trainer", learnItem: "" }]
        : [],
    },
    sources: {
      sources: {
        vendors: [],
        quests: [],
        drop: null,
        skinning: null,
        disenchant: null,
        fishing: [],
        containers: [],
        objectSpots: [],
        containerDrops: [],
      },
      quests: [],
      instanceDrops: [],
      moreInstanceDrops: 0,
      ...overrides,
    },
  };
}

describe("item page shards", () => {
  it("has one Forever and one Classic shard per shard number, as many as the generator writes", () => {
    expect(Object.keys(FOREVER_ITEM_SHARDS)).toHaveLength(ITEM_PAGE_SHARD_COUNT);
    expect(Object.keys(CLASSIC_ITEM_SHARDS)).toHaveLength(ITEM_PAGE_SHARD_COUNT);
  });

  it("puts an item in shard id % count and finds its loader", async () => {
    expect(itemPageShard(11815)).toBe(11815 % ITEM_PAGE_SHARD_COUNT);
    expect(shardFileName(64 + 5)).toBe("05");
    const loader = shardLoader(FOREVER_ITEM_SHARDS, 11815);
    expect(loader).not.toBeNull();
    const file = await loader!();
    expect(file.shardCount).toBe(ITEM_PAGE_SHARD_COUNT);
    expect(file.shard).toBe(itemPageShard(11815));
  });

  it("returns no loader for a glob without the shard", () => {
    expect(shardLoader({}, 1)).toBeNull();
  });
});

describe("item page links", () => {
  it("builds and parses /wow-forever/items/:id", () => {
    expect(itemPageHref(11815)).toBe("/wow-forever/items/11815");
    expect(parseItemId("11815")).toBe(11815);
    for (const bad of [undefined, "", "0", "-3", "abc", "12.5", "123456789"]) expect(parseItemId(bad)).toBeNull();
  });

  it("goes Back to the page that opened it, labelled, and ignores anything else", () => {
    expect(backFromState({ from: "/wow-forever/gear?class=mage" })).toEqual({
      to: "/wow-forever/gear?class=mage",
      label: "Back to Best gear",
    });
    expect(backFromState({ from: "/wow-forever/compare" })?.label).toBe("Back to Item Compare");
    expect(backFromState({ from: "https://example.com" })).toBeNull();
    expect(backFromState(null)).toBeNull();
    expect(backFromState("x")).toBeNull();
  });
});

describe("loadItemPage", () => {
  it("finds a dungeon boss drop with its instance (Hand of Justice)", async () => {
    const p = found(await loadItemPage(11815));
    expect(p.item.name).toBe("Hand of Justice");
    expect(p.facts.bind).toBe(1);
    expect(p.facts.buyPrice).toBeGreaterThan(0);
    const drop = p.sources.instanceDrops.find((d) => d.name === "Emperor Dagran Thaurissan");
    expect(drop?.kind).toBe("boss");
    expect(drop?.chance).toBeCloseTo(19.8);
    expect(drop?.instance.name).toBe("Blackrock Depths");
    expect(drop?.instance.kind).toBe("dungeon");
    expect(drop?.instance.entrance).not.toBeNull();
  });

  it("finds a quest reward with its level and giver (Staff of Westfall)", async () => {
    const p = found(await loadItemPage(2042));
    expect(p.sources.quests.map((q) => q.id)).toContain(166);
    const quest = p.sources.quests.find((q) => q.id === 166)!;
    expect(quest.givers.length).toBeGreaterThan(0);
    expect(quest.minLevel).toBeGreaterThan(0);
    // Quests are listed once, with their level to pick up — not again in the food-shaped sources.
    expect(p.sources.sources.quests).toEqual([]);
  });

  it("finds a random world drop with its level range (Destiny)", async () => {
    const p = found(await loadItemPage(647));
    expect(p.sources.sources.drop?.world).toBe(true);
    expect(p.sources.sources.drop?.levels).toEqual([52, 61]);
  });

  it("finds the recipe that makes it (Robe of the Archmage)", async () => {
    const p = found(await loadItemPage(14152));
    expect(p.facts.crafted[0]).toMatchObject({ profession: "tailoring", learn: "item", learnItem: "Pattern: Robe of the Archmage" });
    expect(p.facts.crafted[0].reagents[0]).toEqual({ id: 14048, count: 12, name: "Bolt of Runecloth" });
  });

  it("says a Classic item Forever hasn't shown yet is unseen, with its Classic name", async () => {
    expect(await loadItemPage(809)).toEqual({ kind: ITEM_PAGE_RESULT.unseen, id: 809, name: "Bloodrazor" });
  });

  it("says an id that's no item is unknown", async () => {
    expect(await loadItemPage(9999999)).toEqual({ kind: ITEM_PAGE_RESULT.unknown, id: 9999999 });
    expect(await loadItemPage(null)).toEqual({ kind: ITEM_PAGE_RESULT.unknown, id: null });
  });
});

describe("decodeItemFacts", () => {
  it("keeps known binds and prices and drops the rest", () => {
    expect(decodeItemFacts(undefined)).toEqual({ bind: null, buyPrice: null, crafted: [] });
    expect(decodeItemFacts({ bind: 9, buy: 0 })).toEqual({ bind: null, buyPrice: null, crafted: [] });
    expect(decodeItemFacts({ bind: 2, buy: 125 })).toMatchObject({ bind: 2, buyPrice: 125 });
  });

  it("skips recipes of a profession that isn't a crafting guide", () => {
    const facts = decodeItemFacts({ crafted: [["cooking", 1, 2, "R", [], "", ""]] });
    expect(facts.crafted).toEqual([]);
  });
});

describe("itemSourceSections", () => {
  it("is empty when nothing is known", () => {
    expect(itemSourceSections(page({}), FACTION.alliance)).toEqual([]);
  });

  it("orders buy, your quests, dungeons, crafting, open world — raids last", () => {
    const drop = { world: true, levels: [1, 2] as [number, number], mobs: [], more: 0, zones: [] };
    const p = page(
      {
        quests: [QUEST],
        instanceDrops: [instanceDrop("raid"), instanceDrop("dungeon")],
        sources: { ...page({}).sources.sources, drop, containers: ["Chest"] },
      },
      true,
    );
    expect(itemSourceSections(p, FACTION.alliance)).toEqual([
      ITEM_SOURCE_SECTION.quest,
      ITEM_SOURCE_SECTION.dungeon,
      ITEM_SOURCE_SECTION.crafted,
      ITEM_SOURCE_SECTION.drop,
      ITEM_SOURCE_SECTION.container,
      ITEM_SOURCE_SECTION.raid,
    ]);
  });

  it("moves a quest only the other faction gets after the open-world sources", () => {
    const drop = { world: true, levels: [1, 2] as [number, number], mobs: [], more: 0, zones: [] };
    const p = page({ quests: [QUEST], sources: { ...page({}).sources.sources, drop } });
    expect(itemSourceSections(p, FACTION.horde)).toEqual([ITEM_SOURCE_SECTION.drop, ITEM_SOURCE_SECTION.quest]);
  });
});

describe("item page text", () => {
  it("prints the tooltip's lines", () => {
    expect(bindText(1)).toBe("Binds when picked up");
    expect(weaponDps({ minDamage: 50, maxDamage: 76, speed: 2.9 })).toBe("(21.7 damage per second)");
    expect(itemStatLines(ITEM).map((l) => l.text)).toEqual(["+4 Spirit", "+9 Stamina", "Equip: +1% Hit %"]);
  });

  it("describes dungeon drops and quests", () => {
    const drop = instanceDrop("dungeon");
    expect(instanceDropText(drop)).toBe("A Boss · boss, level 59 · 19.8%");
    expect(instanceLevelText(drop.instance)).toBe("level 59 dungeon · enter from level 52");
    expect(questLevelText(QUEST)).toBe("level 21 quest · pick up from level 16");
    expect(questLevelText({ ...QUEST, minLevel: 21, classes: "warrior" })).toBe("level 21 quest · Warrior only");
  });

  it("describes a recipe and links its crafting guide at that skill", () => {
    const crafted = decodeItemFacts({
      crafted: [["tailoring", 295, 18457, "Robe", [[14048, 12, "Bolt of Runecloth"]], "item", "Pattern: Robe"]],
    }).crafted[0];
    expect(craftedLine(crafted)).toBe("Tailoring 295 · learn from Pattern: Robe");
    expect(reagentsLine(crafted)).toBe("12 × Bolt of Runecloth");
    expect(craftingGuideHref(crafted)).toBe("/wow-forever/professions?p=tailoring&skill=295");
  });

  it("explains an item with no known source", () => {
    expect(noSourceText(200000)).toMatch(/New in WoW Forever/);
    expect(noSourceText(2042)).toMatch(/Classic data/);
  });
});
