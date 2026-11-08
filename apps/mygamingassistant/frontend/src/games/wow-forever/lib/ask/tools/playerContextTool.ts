/** `get_player_context` — the saved World Map player; with no saved zone, the answer shows a "Where are you?" picker. */
import { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import { ASK_FACTION_LABEL, ASK_NOT_SET } from "@/games/wow-forever/data/ask/askFactionLabels";
import { findClass } from "@/games/wow-forever/data/classes";
import type { AskToolData } from "@/games/wow-forever/types/ask/askToolData";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";

export function playerContextTool(data: AskToolData): AskToolOutcome {
  const { player, world } = data;
  const zone = player.zoneId === null ? undefined : world.zoneById.get(player.zoneId);
  const result = {
    faction: ASK_FACTION_LABEL[player.faction],
    class: findClass(player.classId)?.name ?? ASK_NOT_SET,
    level: player.level ?? ASK_NOT_SET,
    zone: zone?.name ?? ASK_NOT_SET,
  };
  return { content: JSON.stringify(result), isError: false, card: zone === undefined ? { kind: ASK_CARD.where } : null };
}
