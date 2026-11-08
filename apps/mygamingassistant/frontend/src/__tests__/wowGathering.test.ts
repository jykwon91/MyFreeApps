import { describe, expect, it } from "vitest";
import { GATHERING_RANKS } from "@/games/wow-forever/data/professions/gathering/gatheringRanks";
import { MINING_TRAINERS } from "@/games/wow-forever/data/professions/gathering/gatheringTrainers";
import { gatherNow } from "@/games/wow-forever/gathering/gatherNow";
import { nearestTrainer } from "@/games/wow-forever/gathering/nearestTrainer";
import { isWorthSkill, nodeColor, nodeThresholds } from "@/games/wow-forever/gathering/nodeColors";
import { cappedRank, rankAdvice } from "@/games/wow-forever/gathering/rankCaps";
import { rankZones } from "@/games/wow-forever/gathering/rankZones";
import { resolveNodes } from "@/games/wow-forever/gathering/resolveNodes";
import { zoneLevelNote } from "@/games/wow-forever/gathering/zoneLevelNote";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import { SKILL_COLOR } from "@/games/wow-forever/types/gathering/skillColor";
import type { ItemSources, MobSpot, ObjectSpot } from "@/games/wow-forever/types/recipeSources";
import { FACTION, type Territory, type WorldZone } from "@/games/wow-forever/types/worldMap";

function spot(zoneId: number, zoneName: string, territory: Territory | null): MobSpot {
  return { zoneId, zoneName, subzone: "", x: 50, y: 50, territory };
}

function vein(name: string, count: number, at: MobSpot, level: number): ObjectSpot {
  return { name, count, spot: at, gather: { skill: "mining", level } };
}

function sourcesOf(objectSpots: ObjectSpot[]): ItemSources {
  return {
    vendors: [],
    price: null,
    quests: [],
    drop: null,
    skinning: null,
    disenchant: null,
    fishing: [],
    containers: [],
    objectSpots,
    containerDrops: [],
  };
}

const ELWYNN = spot(37, "Elwynn Forest", "alliance");
const DUROTAR = spot(1411, "Durotar", "horde");
const WESTFALL = spot(52, "Westfall", "alliance");
const REDRIDGE = spot(49, "Redridge Mountains", "contested");
const BADLANDS = spot(15, "Badlands", "contested");

const NODES: GatheringNode[] = [
  { name: "Copper", itemId: 2770, node: "Copper Vein" },
  { name: "Tin", itemId: 2771, node: "Tin Vein" },
  { name: "Silver", itemId: 2775, node: "Silver Vein", rare: true },
  { name: "Iron", itemId: 2772, node: "Iron Deposit" },
];

const SPAWNS: Record<number, ObjectSpot[]> = {
  2770: [
    vein("Copper Vein", 40, ELWYNN, 1),
    vein("Copper Vein", 90, DUROTAR, 1),
    vein("Copper Vein", 60, WESTFALL, 1),
    vein("Copper Vein", 3, REDRIDGE, 1),
  ],
  2771: [vein("Tin Vein", 70, REDRIDGE, 65), vein("Tin Vein", 50, WESTFALL, 65), vein("Copper Vein", 99, ELWYNN, 1)],
  2775: [vein("Silver Vein", 30, REDRIDGE, 75)],
  2772: [vein("Iron Deposit", 80, BADLANDS, 125)],
};

function zone(id: number, name: string, levels: [number, number]): WorldZone {
  return { id, name, kind: "zone", continent: 0, parent: 13, bounds: [0, 1, 0, 1], levels } as WorldZone;
}

const ZONES = new Map<number, WorldZone>([
  [37, zone(37, "Elwynn Forest", [1, 10])],
  [52, zone(52, "Westfall", [10, 20])],
  [49, zone(49, "Redridge Mountains", [15, 25])],
  [15, zone(15, "Badlands", [35, 45])],
]);

const RESOLVED: ResolvedNode[] = resolveNodes(NODES, (id) => sourcesOf(SPAWNS[id] ?? []));

describe("node colours", () => {
  it("bands a node by the Classic offsets above its required skill", () => {
    const t = nodeThresholds(65);
    expect(t).toEqual({ orange: 65, yellow: 90, green: 115, grey: 165 });
    expect(nodeColor(t, 64)).toBe(SKILL_COLOR.red);
    expect(nodeColor(t, 65)).toBe(SKILL_COLOR.orange);
    expect(nodeColor(t, 90)).toBe(SKILL_COLOR.yellow);
    expect(nodeColor(t, 115)).toBe(SKILL_COLOR.green);
    expect(nodeColor(t, 165)).toBe(SKILL_COLOR.grey);
  });

  it("takes a node's own offsets", () => {
    expect(nodeThresholds(275, { yellow: 15, green: 25, grey: 75 })).toEqual({ orange: 275, yellow: 290, green: 300, grey: 350 });
  });

  it("only orange and yellow are worth skill", () => {
    expect(isWorthSkill(SKILL_COLOR.orange)).toBe(true);
    expect(isWorthSkill(SKILL_COLOR.yellow)).toBe(true);
    expect(isWorthSkill(SKILL_COLOR.green)).toBe(false);
    expect(isWorthSkill(SKILL_COLOR.red)).toBe(false);
  });
});

describe("resolveNodes", () => {
  it("takes the Lock skill from the node's own spawns, busiest first, ignoring other nodes in the item", () => {
    const tin = RESOLVED[1];
    expect(tin.thresholds.orange).toBe(65);
    expect(tin.spots.map((s) => s.spot.zoneName)).toEqual(["Redridge Mountains", "Westfall"]);
  });

  it("throws when a node has no spawn with a gathering skill", () => {
    expect(() => resolveNodes([{ name: "Pyrite", itemId: 1, node: "Pyrite Vein" }], () => sourcesOf([]))).toThrow(/Pyrite Vein/);
  });
});

describe("gatherNow", () => {
  it("with no skill counts as freshly trained: Copper now, Tin next", () => {
    const now = gatherNow(RESOLVED, null);
    expect(now.now.map((n) => n.resolved.node.name)).toEqual(["Copper"]);
    expect(now.next?.node.name).toBe("Tin");
  });

  it("lists every orange / yellow node, rare ones included, and never makes a rare node the next goal", () => {
    const now = gatherNow(RESOLVED, 80);
    expect(now.now.map((n) => [n.resolved.node.name, n.color])).toEqual([
      ["Tin", SKILL_COLOR.orange],
      ["Silver", SKILL_COLOR.orange],
    ]);
    expect(now.next?.node.name).toBe("Iron");
  });

  it("has no next once every common node is unlocked", () => {
    expect(gatherNow(RESOLVED, 260).next).toBeNull();
  });
});

describe("rank caps", () => {
  it("is capped only on a cap with a higher rank to train", () => {
    expect(cappedRank(GATHERING_RANKS, 74)).toBeNull();
    expect(cappedRank(GATHERING_RANKS, 75)?.next.name).toBe("Journeyman");
    expect(cappedRank(GATHERING_RANKS, 150)?.next.name).toBe("Expert");
    expect(cappedRank(GATHERING_RANKS, 225)?.next.name).toBe("Artisan");
    expect(cappedRank(GATHERING_RANKS, 300)).toBeNull();
    expect(cappedRank(GATHERING_RANKS, null)).toBeNull();
  });

  it("says which rank to train next", () => {
    expect(rankAdvice(GATHERING_RANKS, null, "Mining")).toBeNull();
    expect(rankAdvice(GATHERING_RANKS, 10, "Mining")).toBe("At 50, train Journeyman — you stop at 75 without it.");
    expect(rankAdvice(GATHERING_RANKS, 60, "Mining")).toBe("Train Journeyman now (from 50), or you stop at 75.");
    expect(rankAdvice(GATHERING_RANKS, 260, "Mining")).toBe("Artisan takes you the rest of the way, to 300.");
    expect(rankAdvice(GATHERING_RANKS, 300, "Mining")).toBe("Mining is maxed at 300.");
  });
});

describe("rankZones", () => {
  it("leaves out the other faction's ground and zones with too few spawns", () => {
    const zones = rankZones({ nodes: RESOLVED, skill: 1, faction: FACTION.alliance, level: null, zoneById: ZONES });
    expect(zones.map((z) => z.zoneName)).toEqual(["Westfall", "Elwynn Forest"]);
  });

  it("ranks the zone that fits your level first", () => {
    const zones = rankZones({ nodes: RESOLVED, skill: 1, faction: FACTION.alliance, level: 5, zoneById: ZONES });
    expect(zones.map((z) => z.zoneName)).toEqual(["Elwynn Forest", "Westfall"]);
    expect(zones[0].aboveYou).toBe(false);
  });

  it("keeps zones above you but lists them last", () => {
    const zones = rankZones({ nodes: RESOLVED, skill: 70, faction: FACTION.alliance, level: 5, zoneById: ZONES });
    expect(zones.map((z) => [z.zoneName, z.aboveYou])).toEqual([
      ["Westfall", true],
      ["Redridge Mountains", true],
    ]);
    const fits = rankZones({ nodes: RESOLVED, skill: 70, faction: FACTION.alliance, level: 15, zoneById: ZONES });
    expect(fits.map((z) => z.zoneName)).toEqual(["Redridge Mountains", "Westfall"]);
  });

  it("past every node's yellow, sends you to the highest one you can gather", () => {
    const zones = rankZones({ nodes: RESOLVED, skill: 260, faction: FACTION.horde, level: 60, zoneById: ZONES });
    expect(zones.map((z) => [z.zoneName, z.nodes])).toEqual([["Badlands", ["Iron"]]]);
  });

  it("names a node once per zone and ranks a zone with no level range after the ones that have one", () => {
    const loch = spot(38, "Loch Modan", "alliance");
    const copper = [{ name: "Copper", itemId: 2770, node: "Copper Vein" }];
    const spawns = [vein("Copper Vein", 200, loch, 1), vein("Copper Vein", 150, loch, 1), vein("Copper Vein", 20, ELWYNN, 1)];
    const nodes = resolveNodes(copper, () => sourcesOf(spawns));
    const zones = rankZones({ nodes, skill: 1, faction: FACTION.alliance, level: 5, zoneById: ZONES });
    expect(zones.map((z) => [z.zoneName, z.nodes, z.count])).toEqual([
      ["Elwynn Forest", ["Copper"], 20],
      ["Loch Modan", ["Copper"], 200],
    ]);
  });
});

describe("zoneLevelNote", () => {
  it("says when the mobs are above you", () => {
    expect(zoneLevelNote({ levels: [35, 45], aboveYou: true })).toMatch(/^Mobs here are .*35.*45.* — above you\.$/);
    expect(zoneLevelNote({ levels: [10, 20], aboveYou: false })).toMatch(/^Zone .*10.*20.*\.$/);
    expect(zoneLevelNote({ levels: null, aboveYou: false })).toBe("");
  });
});

describe("nearestTrainer", () => {
  it("picks the trainer in your zone, else your first capital's", () => {
    expect(nearestTrainer(MINING_TRAINERS, FACTION.alliance, "Loch Modan").name).toBe("Brock Stoneseeker");
    expect(nearestTrainer(MINING_TRAINERS, FACTION.alliance, "Ironforge").name).toBe("Geofram Bouldertoe");
    expect(nearestTrainer(MINING_TRAINERS, FACTION.horde, "Elwynn Forest").name).toBe("Makaru");
    expect(nearestTrainer(MINING_TRAINERS, FACTION.alliance, null).name).toBe("Gelman Stonehand");
  });
});
