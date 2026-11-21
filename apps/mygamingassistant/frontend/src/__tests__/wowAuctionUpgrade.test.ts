import { describe, expect, it } from "vitest";
import { buildUpgradeMap, sortByUpgrade, upgradeNumericScore } from "@/games/wow-forever/lib/auctionHouse/auctionUpgrade";
import type { AuctionUpgrade } from "@/games/wow-forever/types/auctionHouse/auctionUpgrade";
import type { AuctionPrice } from "@/games/wow-forever/types/auctionPrice";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { VerdictScoring } from "@/games/wow-forever/types/itemCompare/verdictScoring";

// ─── Helpers ────────────────────────────────────────────────────────────────

function price(itemId: number, name: string): AuctionPrice {
  return { itemId, name, marketValue: 1000, minBuyout: 900, quantity: 5, listings: 2 };
}

function clientItem(id: number, over: Partial<ClientItem> = {}): ClientItem {
  return {
    id,
    name: `Item ${id}`,
    quality: "uncommon",
    slot: "head",
    itemType: "Plate",
    itemLevel: 30,
    requiredLevel: 20,
    armor: 100,
    weapon: null,
    stats: { stamina: 10, strength: 5 },
    classes: null,
    damageUnknown: false,
    spellPowerUnknown: false,
    otherEffects: 0,
    randomSuffix: false,
    ...over,
  };
}

function charItem(slot: string, itemId: number): import("@/games/wow-forever/types/character/characterItem").CharacterItem {
  return {
    slot,
    item_id: itemId,
    name: `Equipped ${itemId}`,
    quality: "uncommon",
    item_level: 25,
    inventory_type: "HEAD",
    inventory_type_name: "Head",
    subclass_name: "Plate",
    binding: null,
    armor: "80",
    weapon: null,
    stats: [],
    enchantments: [],
    spells: [],
    set_name: null,
    requirements: [],
    durability: null,
    durability_low: false,
    description: null,
  };
}

function character(items: ReturnType<typeof charItem>[] = []): CharacterResponse {
  return {
    slug: "topdeadcenter-pvp",
    name: "Topdeadcenter",
    surname: "",
    level: 60,
    race: "Human",
    class_id: 2,
    class_name: "Paladin",
    gender: "male",
    faction: "alliance",
    guild: null,
    guild_slug: null,
    ruleset: null,
    equipped_item_level: null,
    last_login: null,
    has_render: false,
    items,
    stats: null,
    talents: null,
    professions: null,
    reputations: null,
    pvp: null,
    collections: { mounts: null, pets: null },
    dungeons: null,
  };
}

// ─── upgradeNumericScore ──────────────────────────────────────────────────────

describe("upgradeNumericScore", () => {
  it("returns +pct for upgrades", () => {
    const u: AuctionUpgrade = { kind: "verdict", verdict: { kind: "upgrade", pct: 42, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "Old Helm" };
    expect(upgradeNumericScore(u)).toBe(42);
  });

  it("returns pct (negative) for downgrades", () => {
    const u: AuctionUpgrade = { kind: "verdict", verdict: { kind: "downgrade", pct: -15, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "Old Helm" };
    expect(upgradeNumericScore(u)).toBe(-15);
  });

  it("returns 0 for same", () => {
    const u: AuctionUpgrade = { kind: "verdict", verdict: { kind: "same", pct: null, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "Old Helm" };
    expect(upgradeNumericScore(u)).toBe(0);
  });

  it("falls back to +1 / −1 when pct is null", () => {
    const up: AuctionUpgrade = { kind: "verdict", verdict: { kind: "upgrade", pct: null, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "" };
    const down: AuctionUpgrade = { kind: "verdict", verdict: { kind: "downgrade", pct: null, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "" };
    expect(upgradeNumericScore(up)).toBe(1);
    expect(upgradeNumericScore(down)).toBe(-1);
  });

  it("returns -Infinity for slot-empty, cant-use, unknown-stats, not-equippable", () => {
    expect(upgradeNumericScore({ kind: "slot-empty" })).toBe(-Infinity);
    expect(upgradeNumericScore({ kind: "cant-use" })).toBe(-Infinity);
    expect(upgradeNumericScore({ kind: "unknown-stats" })).toBe(-Infinity);
    expect(upgradeNumericScore({ kind: "not-equippable" })).toBe(-Infinity);
  });

  it("returns -Infinity for undefined", () => {
    expect(upgradeNumericScore(undefined)).toBe(-Infinity);
  });

  it("returns -Infinity for verdict with null verdict (no scorer)", () => {
    const u: AuctionUpgrade = { kind: "verdict", verdict: null, equippedItemId: 1, equippedName: "" };
    expect(upgradeNumericScore(u)).toBe(-Infinity);
  });
});

// ─── sortByUpgrade ──────────────────────────────────────────────────────────

describe("sortByUpgrade", () => {
  const bigUpgrade: AuctionUpgrade = { kind: "verdict", verdict: { kind: "upgrade", pct: 80, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "" };
  const smallUpgrade: AuctionUpgrade = { kind: "verdict", verdict: { kind: "upgrade", pct: 20, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "" };
  const same: AuctionUpgrade = { kind: "verdict", verdict: { kind: "same", pct: null, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "" };
  const downgrade: AuctionUpgrade = { kind: "verdict", verdict: { kind: "downgrade", pct: -10, statsOnly: false, bothHands: false }, equippedItemId: 1, equippedName: "" };
  const slotEmpty: AuctionUpgrade = { kind: "slot-empty" };

  const items = [
    price(1, "Downgrade Helm"),
    price(2, "Slot Empty Ring"),
    price(3, "Big Upgrade Chest"),
    price(4, "Small Upgrade Legs"),
    price(5, "Same Shield"),
  ];
  const upgradeMap = new Map<number, AuctionUpgrade>([
    [1, downgrade],
    [2, slotEmpty],
    [3, bigUpgrade],
    [4, smallUpgrade],
    [5, same],
  ]);

  it("sorts desc: biggest upgrade first, non-finite scores last", () => {
    const result = sortByUpgrade(items, upgradeMap, "desc");
    expect(result.map((r) => r.name)).toEqual([
      "Big Upgrade Chest",    // +80
      "Small Upgrade Legs",   // +20
      "Same Shield",          // 0
      "Downgrade Helm",       // -10
      "Slot Empty Ring",      // -Infinity
    ]);
  });

  it("sorts asc: worst first, non-finite scores still last", () => {
    const result = sortByUpgrade(items, upgradeMap, "asc");
    expect(result.map((r) => r.name)).toEqual([
      "Downgrade Helm",       // -10
      "Same Shield",          // 0
      "Small Upgrade Legs",   // +20
      "Big Upgrade Chest",    // +80
      "Slot Empty Ring",      // -Infinity (last even when asc)
    ]);
  });

  it("never mutates the original array", () => {
    const original = [...items];
    sortByUpgrade(items, upgradeMap, "desc");
    expect(items).toEqual(original);
  });

  it("breaks ties by name A→Z then itemId", () => {
    const tied = [price(10, "Zeal"), price(11, "Alpha")];
    const tiedMap = new Map<number, AuctionUpgrade>([
      [10, same],
      [11, same],
    ]);
    const result = sortByUpgrade(tied, tiedMap, "desc");
    expect(result.map((r) => r.name)).toEqual(["Alpha", "Zeal"]);
  });

  it("sorts null-verdict items (e.g. spellPowerUnknown caster weapon) below real verdicts in both directions", () => {
    // A known comparison where verdict is null (scorer provided but returns null —
    // e.g. equippedComparisons returns null when spellPowerUnknown is true for either item).
    const nullVerdictUpgrade: AuctionUpgrade = {
      kind: "verdict",
      verdict: null,
      equippedItemId: 100,
      equippedName: "Zum'rah's Vexing Cane",
    };
    const realUpgrade: AuctionUpgrade = {
      kind: "verdict",
      verdict: { kind: "upgrade", pct: 50, statsOnly: false, bothHands: false },
      equippedItemId: 101,
      equippedName: "Iron Knuckles",
    };

    const testItems = [price(1, "Zum'rah's AH Copy"), price(2, "Fist Weapon")];
    const upgradeMap = new Map<number, AuctionUpgrade>([
      [1, nullVerdictUpgrade],
      [2, realUpgrade],
    ]);

    // desc: real upgrade (+50) first, then null-verdict (treated as -Infinity)
    expect(sortByUpgrade(testItems, upgradeMap, "desc").map((r) => r.name)).toEqual([
      "Fist Weapon",
      "Zum'rah's AH Copy",
    ]);
    // asc: same — null-verdict still last even when reversing direction
    expect(sortByUpgrade(testItems, upgradeMap, "asc").map((r) => r.name)).toEqual([
      "Fist Weapon",
      "Zum'rah's AH Copy",
    ]);
  });
});

// ─── buildUpgradeMap ─────────────────────────────────────────────────────────

describe("buildUpgradeMap", () => {
  const HELM_ID = 100;
  const RING_ID = 200;
  const CONSUMABLE_ID = 300;

  const helm = clientItem(HELM_ID, { slot: "head", stats: { stamina: 20, strength: 10 } });
  const ring = clientItem(RING_ID, { slot: "finger", itemType: null, stats: { agility: 15 } });
  const consumable = clientItem(CONSUMABLE_ID, { slot: "other" });

  const itemsById = new Map<number, ClientItem>([
    [HELM_ID, helm],
    [RING_ID, ring],
    [CONSUMABLE_ID, consumable],
  ]);

  it("marks consumables and other non-gear items as not-equippable", () => {
    const char = character([charItem("HEAD", 999)]);
    const map = buildUpgradeMap([price(CONSUMABLE_ID, "Potion")], char, itemsById, null);
    expect(map.get(CONSUMABLE_ID)).toEqual({ kind: "not-equippable" });
  });

  it("marks items as slot-empty when no gear is in that slot", () => {
    const char = character([]); // no items equipped
    const map = buildUpgradeMap([price(HELM_ID, "Test Helm")], char, itemsById, null);
    expect(map.get(HELM_ID)).toEqual({ kind: "slot-empty" });
  });

  it("omits items not in itemsById (not in game files)", () => {
    const char = character([]);
    const map = buildUpgradeMap([price(99999, "Unknown Item")], char, itemsById, null);
    expect(map.has(99999)).toBe(false);
  });

  it("produces a verdict entry when gear is equipped in the slot", () => {
    const char = character([charItem("HEAD", 999)]);
    // Provide item 999 so equippedComparisons can look it up
    const enrichedById = new Map([...itemsById, [999, clientItem(999, { stats: { stamina: 5, strength: 3 } })]]);
    const map = buildUpgradeMap([price(HELM_ID, "Test Helm")], char, enrichedById, null);
    const result = map.get(HELM_ID);
    expect(result?.kind).toBe("verdict");
    if (result?.kind === "verdict") {
      expect(result.equippedItemId).toBe(999);
      expect(result.equippedName).toBe("Equipped 999");
    }
  });

  it("pairs rings: compares against the weaker slot (best upgrade result)", () => {
    // Two rings equipped: a weak one (score ~5) and a strong one (score ~100).
    // A new ring with moderate stats should compare against the weak ring → upgrade.
    const weakRing = clientItem(201, { slot: "finger", itemType: null, stats: { agility: 5 } });
    const strongRing = clientItem(202, { slot: "finger", itemType: null, stats: { agility: 100 } });
    const newRing = clientItem(RING_ID, { slot: "finger", itemType: null, stats: { agility: 20 } });

    const richItems = new Map([
      [RING_ID, newRing],
      [201, weakRing],
      [202, strongRing],
    ]);
    const scorer: VerdictScoring = {
      score: (item: ClientItem) => (item.stats.agility ?? 0) as number,
      label: "Rogue",
      leveling: false,
    };
    const char = character([
      charItem("FINGER_1", 201), // weak ring
      charItem("FINGER_2", 202), // strong ring
    ]);

    const map = buildUpgradeMap([price(RING_ID, "New Ring")], char, richItems, scorer);
    const result = map.get(RING_ID);
    expect(result?.kind).toBe("verdict");
    if (result?.kind === "verdict") {
      // Should compare against the weak ring (201) → bigger upgrade
      expect(result.equippedItemId).toBe(201);
      expect(result.verdict?.kind).toBe("upgrade");
    }
  });

  it("produces verdict null (no scorer) when scoring is not available", () => {
    const char = character([charItem("HEAD", 999)]);
    const enrichedById = new Map([...itemsById, [999, clientItem(999, { stats: { stamina: 5 } })]]);
    const map = buildUpgradeMap([price(HELM_ID, "Test Helm")], char, enrichedById, null);
    const result = map.get(HELM_ID);
    expect(result?.kind).toBe("verdict");
    if (result?.kind === "verdict") {
      // No scorer → verdict is null (can't score without weights)
      expect(result.verdict).toBeNull();
    }
  });
});
