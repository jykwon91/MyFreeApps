import type { GearData } from "@/games/wow-forever/types/gearData";
import type { GearFactsFile } from "@/games/wow-forever/types/gearFactsFile";
import type { GearItemFacts } from "@/games/wow-forever/types/gearItemFacts";
import type { DropGearSource, GearSource } from "@/games/wow-forever/types/gearSource";
import type { GearSourcesFile } from "@/games/wow-forever/types/gearSourcesFile";
import { FACTION, type Faction } from "@/games/wow-forever/types/worldMap";

const SIDES: ReadonlySet<string> = new Set(Object.values(FACTION));

function sideOf(value: string): Faction {
  if (!SIDES.has(value)) throw new Error(`Gear sources: unknown quest side "${value}"`);
  return value as Faction;
}

function push(map: Map<number, GearSource[]>, id: string, source: GearSource): void {
  const key = Number(id);
  const list = map.get(key);
  if (list) list.push(source);
  else map.set(key, [source]);
}

function factsFor(file: GearFactsFile, classicPvp: ReadonlySet<string>, id: string): GearItemFacts {
  const requires = file.requires[id];
  const reputation = file.reputation[id];
  return {
    requires: requires ? { skill: requires[0], rank: requires[1] } : null,
    reputation: reputation ? { faction: reputation[0], rank: reputation[1] } : null,
    pvp: file.pvp[id] === 1 || classicPvp.has(id),
    bindOnPickup: file.bindOnPickup[id] === 1,
  };
}

/** Join the two generated files into per-item sources and facts. Crafted (game files) first. */
export function decodeGearData(facts: GearFactsFile, classic: GearSourcesFile): GearData {
  const sources = new Map<number, GearSource[]>();
  for (const [id, [profession, skill]] of Object.entries(facts.crafted)) {
    push(sources, id, { kind: "crafted", profession, skill });
  }
  for (const [id, rows] of Object.entries(classic.quests)) {
    for (const [title, minLevel, questLevel, side, classes] of rows) {
      push(sources, id, {
        kind: "quest",
        title,
        minLevel,
        questLevel,
        side: sideOf(side),
        classes: classes === "" ? [] : classes.split(","),
      });
    }
  }
  for (const [id, rows] of Object.entries(classic.drops)) {
    for (const [boss, mapId] of rows) {
      const dungeon = classic.dungeons[String(mapId)];
      const drop: DropGearSource = {
        kind: "drop",
        boss,
        dungeon: dungeon ? { name: dungeon[0], level: dungeon[1], enterAt: dungeon[2] } : null,
      };
      push(sources, id, drop);
    }
  }

  const classicPvp: ReadonlySet<string> = new Set(classic.pvp.map(String));
  const factIds = new Set([
    ...classicPvp,
    ...Object.keys(facts.requires),
    ...Object.keys(facts.reputation),
    ...Object.keys(facts.pvp),
    ...Object.keys(facts.bindOnPickup),
  ]);
  const itemFacts = new Map<number, GearItemFacts>();
  for (const id of factIds) itemFacts.set(Number(id), factsFor(facts, classicPvp, id));

  return {
    sources,
    facts: itemFacts,
    unobtainable: new Set([...classic.raidOnly, ...facts.deprecated, ...facts.eraLeftovers]),
    clientBuild: facts.clientBuild,
  };
}

export const NO_FACTS: GearItemFacts = { requires: null, reputation: null, pvp: false, bindOnPickup: false };
