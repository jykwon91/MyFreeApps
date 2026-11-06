import { CONTEXT_CLASS_LABEL, CONTEXT_LEVEL_BAND_LABEL } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import { readStored } from "@/games/wow-forever/lib/safeLocalStorage";
import {
  PLAYER_SETTINGS_STORAGE_KEY,
  parsePlayerSettings,
  type PlayerSettings,
} from "@/games/wow-forever/hooks/usePlayerSettings";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { ContextFaction } from "@/games/wow-forever/types/featureRequests/contextFaction";
import type { ContextLevelBand } from "@/games/wow-forever/types/featureRequests/contextLevelBand";
import type { PlayerPrefill } from "@/games/wow-forever/types/featureRequests/playerPrefill";
import type { SubmissionContext } from "@/games/wow-forever/types/featureRequests/submissionContext";

/** Upper level of each band below 60, ascending. */
const LEVEL_BAND_TOPS: readonly { top: number; band: ContextLevelBand }[] = [
  { top: 10, band: "1-10" },
  { top: 20, band: "11-20" },
  { top: 30, band: "21-30" },
  { top: 40, band: "31-40" },
  { top: 50, band: "41-50" },
  { top: 59, band: "51-59" },
];

/** The band a level falls in. Level 60 reads as "just got there" — the World Map can't tell raiding. */
export function levelBandFor(level: number): ContextLevelBand {
  if (level >= MAX_LEVEL) return "60-fresh";
  return LEVEL_BAND_TOPS.find((b) => level <= b.top)?.band ?? "60-fresh";
}

function contextFaction(faction: PlayerSettings["faction"]): ContextFaction {
  return faction === FACTION.horde ? "horde" : "alliance";
}

/** The "about you" answers the World Map's saved player gives, and the one line that says so. */
export function prefillFromPlayer(player: PlayerSettings): PlayerPrefill {
  const context: SubmissionContext = { class_id: player.classId, faction: contextFaction(player.faction) };
  const parts = [CONTEXT_CLASS_LABEL[player.classId]];
  if (player.level !== null) {
    const band = levelBandFor(player.level);
    context.level_band = band;
    parts.push(CONTEXT_LEVEL_BAND_LABEL[band]);
  }
  return { context, summary: `Using your saved ${parts.join(", ")}` };
}

/**
 * Prefill from `mga.wowForever.worldMap.player.v1` — only when the player really saved one (the World
 * Map, Gold or Food page), never from the defaults. A stored value that no longer passes the World Map's
 * own check is ignored.
 */
export function readPlayerPrefill(): PlayerPrefill | null {
  const player = readStored(PLAYER_SETTINGS_STORAGE_KEY, parsePlayerSettings, null);
  return player === null ? null : prefillFromPlayer(player);
}
