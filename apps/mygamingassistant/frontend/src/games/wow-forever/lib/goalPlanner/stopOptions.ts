/** Turn the data's NPC and spot shapes into the planner's one place shape. */
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { StopOption } from "@/games/wow-forever/types/goalPlanner/stopOption";
import type { MobSpot, QuestGiver, VendorSpot } from "@/games/wow-forever/types/recipeSources";
import type { MapPoi } from "@/games/wow-forever/types/worldMap";

function spotWhere(spot: { zoneName: string; subzone: string }): string {
  return spot.subzone && spot.subzone !== spot.zoneName ? `${spot.subzone}, ${spot.zoneName}` : spot.zoneName;
}

/** A trainer, book seller or quest giver the hand-written data places by NPC id (the map knows its zone). */
export function trainerOption(npc: TrainerNpc): StopOption {
  return { key: `npc-${npc.npcId}`, name: npc.name, where: npc.where, npcId: npc.npcId, poiId: null, zoneId: null, x: npc.x, y: npc.y };
}

export function rankTrainerOption(trainer: RankTrainer): StopOption {
  return { ...trainerOption(trainer), zoneId: trainer.zoneId };
}

export function vendorOption(vendor: VendorSpot): StopOption {
  return {
    key: `npc-${vendor.npcId}`,
    name: vendor.name,
    where: spotWhere(vendor),
    npcId: vendor.npcId,
    poiId: null,
    zoneId: vendor.zoneId,
    x: vendor.x,
    y: vendor.y,
  };
}

export function questGiverOption(giver: QuestGiver, index: number): StopOption {
  return { key: `giver-${index}-${giver.name}`, name: giver.name, where: spotWhere(giver), npcId: null, poiId: null, zoneId: giver.zoneId, x: giver.x, y: giver.y };
}

/** A mob's biggest pack: go there and farm it. */
export function mobOption(name: string, spot: MobSpot): StopOption {
  return { key: `mob-${name}-${spot.zoneId}`, name, where: spotWhere(spot), npcId: null, poiId: null, zoneId: spot.zoneId, x: spot.x, y: spot.y };
}

/** A World Map POI (an auctioneer, a dungeon entrance). */
export function poiOption(poi: MapPoi, zoneName: string): StopOption {
  return {
    key: `poi-${poi.id}`,
    name: poi.name,
    where: poi.subzone && poi.subzone !== zoneName ? `${poi.subzone}, ${zoneName}` : zoneName,
    npcId: null,
    poiId: poi.id,
    zoneId: poi.zone,
    x: poi.x,
    y: poi.y,
  };
}

