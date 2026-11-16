import { OBJECTIVE_VERB } from "@/games/wow-forever/data/dungeonQuestsAddon/objectiveVerb";
import type { QuestObjective } from "@/games/wow-forever/types/dungeons/questObjective";

/** "Kill Edwin VanCleef", "Collect 10 Red Silk Bandana", as the addon's "Next:" line lists them. */
export function objectiveText(o: QuestObjective): string {
  return `${OBJECTIVE_VERB[o.kind]} ${o.count > 1 ? `${o.count} ` : ""}${o.name}`;
}
