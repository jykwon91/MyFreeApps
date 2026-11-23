import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import services from "@/games/wow-forever/data/worldMap/classic/classicServices.json";
import type { AddonPlace } from "@/games/wow-forever/types/professionsAddon/addonPlace";

const NPC_ID_COLUMN = services.columns.indexOf("npcId");
const ZONE_COLUMN = services.columns.indexOf("zone");

/** The World Map zone each service NPC stands in, by NPC id (the first row wins when one NPC has several). */
const ZONE_BY_NPC: ReadonlyMap<number, number> = new Map(
  [...services.rows].reverse().map((row) => [Number(row[NPC_ID_COLUMN]), Number(row[ZONE_COLUMN])] as const),
);

/** A trainer, vendor or quest giver as a pinnable place. Throws when the World Map doesn't know the NPC: a pin needs its zone. */
export function npcPlace(npc: TrainerNpc): AddonPlace {
  const map = ZONE_BY_NPC.get(npc.npcId);
  if (map === undefined) throw new Error(`Professions addon: NPC ${npc.npcId} (${npc.name}) is not in the World Map's services`);
  return { name: npc.name, map, x: npc.x, y: npc.y, where: npc.where };
}

/** A rank trainer already carries its zone. */
export function rankTrainerPlace(trainer: RankTrainer): AddonPlace {
  return { name: trainer.name, map: trainer.zoneId, x: trainer.x, y: trainer.y, where: trainer.where };
}
