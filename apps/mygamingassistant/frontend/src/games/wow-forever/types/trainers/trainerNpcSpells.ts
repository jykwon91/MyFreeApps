import type { TrainerProfessionMap } from "@/games/wow-forever/types/trainers/trainerProfessionMap";

/** Per-NPC recipe list from cmangos. `{profession: {npcId: [[spell, foreverSkill, costCopper], ...]}}`. */
export interface TrainerNpcSpells {
  source: string;
  tailoring: TrainerProfessionMap;
  enchanting: TrainerProfessionMap;
  alchemy: TrainerProfessionMap;
  blacksmithing: TrainerProfessionMap;
  leatherworking: TrainerProfessionMap;
  engineering: TrainerProfessionMap;
  firstaid: TrainerProfessionMap;
}
