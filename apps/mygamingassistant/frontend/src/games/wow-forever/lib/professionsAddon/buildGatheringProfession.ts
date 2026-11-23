import { MIN_ZONE_SPAWNS } from "@/games/wow-forever/data/professions/gathering/gatheringConfig";
import { GATHERING_GUIDES } from "@/games/wow-forever/data/professions/gathering/gatheringGuides";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { decodeSkinning } from "@/games/wow-forever/gathering/decodeSkinning";
import { loadZoneById } from "@/games/wow-forever/gathering/loadZoneById";
import { resolveNodes } from "@/games/wow-forever/gathering/resolveNodes";
import { buildGuideSteps } from "@/games/wow-forever/lib/professionsAddon/buildGuideSteps";
import { buildGatheringRanks } from "@/games/wow-forever/lib/professionsAddon/buildRanks";
import { notesOf } from "@/games/wow-forever/lib/professionsAddon/notesOf";
import { territorySide } from "@/games/wow-forever/lib/professionsAddon/territorySide";
import { GATHERING_KIND } from "@/games/wow-forever/types/gathering/gatheringKind";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { MobGatheringGuide } from "@/games/wow-forever/types/gathering/mobGatheringGuide";
import type { NodeGatheringGuide } from "@/games/wow-forever/types/gathering/nodeGatheringGuide";
import type { ResolvedNode } from "@/games/wow-forever/types/gathering/resolvedNode";
import type { AddonMob } from "@/games/wow-forever/types/professionsAddon/addonMob";
import type { AddonNode } from "@/games/wow-forever/types/professionsAddon/addonNode";
import { ADDON_PROFESSION_KIND, type AddonProfession } from "@/games/wow-forever/types/professionsAddon/addonProfession";
import type { MobSpot } from "@/games/wow-forever/types/recipeSources";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

type ZoneLevels = ReadonlyMap<number, WorldZone>;

function levelsOf(zones: ZoneLevels, zoneId: number): readonly [number, number] | null {
  const levels = zones.get(zoneId)?.levels;
  return levels ? [levels[0], levels[1]] : null;
}

function nodeOf(resolved: ResolvedNode, zones: ZoneLevels): AddonNode {
  const { node, thresholds, spots } = resolved;
  return {
    name: node.name,
    itemId: node.itemId,
    rare: node.rare === true,
    orange: thresholds.orange,
    yellow: thresholds.yellow,
    green: thresholds.green,
    grey: thresholds.grey,
    zones: spots
      .filter((o) => o.count >= MIN_ZONE_SPAWNS)
      .map((o) => ({
        map: o.spot.zoneId,
        name: o.spot.zoneName,
        count: o.count,
        side: territorySide(o.spot.territory),
        levels: levelsOf(zones, o.spot.zoneId),
        x: o.spot.x,
        y: o.spot.y,
        subzone: o.spot.subzone,
      })),
  };
}

function mobOf(mob: { name: string; minLevel: number; maxLevel: number; spawns: number; spot: MobSpot; leather: { name: string } }, zones: ZoneLevels): AddonMob {
  return {
    name: mob.name,
    minLevel: mob.minLevel,
    maxLevel: mob.maxLevel,
    spawns: mob.spawns,
    map: mob.spot.zoneId,
    zone: mob.spot.zoneName,
    side: territorySide(mob.spot.territory),
    levels: levelsOf(zones, mob.spot.zoneId),
    x: mob.spot.x,
    y: mob.spot.y,
    subzone: mob.spot.subzone,
    leather: mob.leather.name,
  };
}

async function nodesOf(guide: NodeGatheringGuide, zones: ZoneLevels): Promise<AddonNode[]> {
  const sources = await import("@/games/wow-forever/data/professions/crafting/classic/sources.json");
  const lookup = createSourceLookup(sources.default as unknown as RawSourcesFile);
  return resolveNodes(guide.nodes, (id) => lookup.reagent(id)).map((resolved) => nodeOf(resolved, zones));
}

async function mobsOf(guide: MobGatheringGuide, zones: ZoneLevels): Promise<AddonMob[]> {
  return decodeSkinning(await guide.load()).mobs.map((mob) => mobOf(mob, zones));
}

/** Mining, Herbalism or Skinning: the route, ranks and trainers, plus the node or mob data the addon ranks zones from. */
export async function buildGatheringProfession(key: GatheringProfession): Promise<AddonProfession> {
  const guide = GATHERING_GUIDES[key];
  const zones = await loadZoneById();
  const isNodes = (g: typeof guide): g is NodeGatheringGuide => g.kind === GATHERING_KIND.nodes;
  return {
    key,
    label: guide.label,
    skillLine: PROFESSION_SKILL_LINES[key],
    kind: ADDON_PROFESSION_KIND.gathering,
    intro: guide.routeIntro,
    steps: buildGuideSteps(guide.route),
    ranks: buildGatheringRanks(guide.trainers),
    notes: notesOf(guide.forever),
    nodes: isNodes(guide) ? await nodesOf(guide, zones) : [],
    mobs: isNodes(guide) ? [] : await mobsOf(guide, zones),
  };
}
