import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The trainer's area label is the zone ("Ironforge") or "<town>, <zone>" ("Kharanos, Dun Morogh"). */
function inZone(npc: TrainerNpc, zoneName: string): boolean {
  return npc.where === zoneName || npc.where.endsWith(`, ${zoneName}`);
}

/**
 * The trainer to send you to: one in the zone you're in (a city's or a
 * town's), else your faction's first capital trainer. `zoneName` = null when
 * your zone isn't set.
 */
export function nearestTrainer(trainers: CraftingTrainers, faction: PlayerFaction, zoneName: string | null): TrainerNpc {
  const cities = trainers.cities[faction].map((c) => c.npc);
  if (zoneName !== null) {
    const here = [...cities, ...trainers.towns[faction]].find((npc) => inZone(npc, zoneName));
    if (here) return here;
  }
  return cities[0];
}
