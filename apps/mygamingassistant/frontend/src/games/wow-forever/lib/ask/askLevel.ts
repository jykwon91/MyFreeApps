/** The level the rares and gold tools answer for: the one the player said, else their saved one. */
import { ASK_NOT_SET } from "@/games/wow-forever/data/ask/askFactionLabels";
import { ASK_TOOL_NOTE } from "@/games/wow-forever/data/ask/askToolNotes";
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { AskLevel } from "@/games/wow-forever/types/ask/askLevel";
import type { AskToolOutcome } from "@/games/wow-forever/types/ask/askToolOutcome";

export function askLevel(said: number | null, player: PlayerSettings): AskLevel | null {
  if (said !== null) return { level: said, fromMessage: true };
  return player.level === null ? null : { level: player.level, fromMessage: false };
}

export function levelSource(level: AskLevel): string {
  return level.fromMessage ? ASK_TOOL_NOTE.fromMessage : ASK_TOOL_NOTE.savedLevel;
}

/** No level said and none saved: Claude asks for it, and there's no card. */
export function levelNotSet(): AskToolOutcome {
  return { content: JSON.stringify({ level: ASK_NOT_SET, note: ASK_TOOL_NOTE.levelNotSet }), isError: false, card: null };
}
