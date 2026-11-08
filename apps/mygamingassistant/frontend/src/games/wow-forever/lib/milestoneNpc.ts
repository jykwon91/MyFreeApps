import type { MilestoneStep, TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** The NPC a milestone sends this faction to (book seller, quest giver); null when it names none. */
export function milestoneNpc(step: MilestoneStep, faction: PlayerFaction): TrainerNpc | null {
  const { npc } = step;
  if (!npc) return null;
  return "npcId" in npc ? npc : npc[faction];
}
